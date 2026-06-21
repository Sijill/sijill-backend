import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DatabaseService } from '@db/database.service';
import { PatientAIRepository } from './patient-ai.repository';
import type { AiProvider } from './interfaces/ai-provider.interface';

@Injectable()
export class PatientAIChatService {
	constructor(
		@Inject('AI_PROVIDER')
		private readonly aiProvider: AiProvider,
		private readonly repository: PatientAIRepository,
		private readonly databaseService: DatabaseService,
		private readonly logger: PinoLogger,
	) {
		this.logger.setContext(PatientAIChatService.name);
	}

	async sendMessage(
		patientId: string,
		sessionId: string,
		content: string,
	): Promise<{
		userMessage: {
			id: string;
			role: string;
			content: string;
			createdAt: Date;
		};
		assistantMessage: {
			id: string;
			role: string;
			content: string;
			createdAt: Date;
		};
		session: {
			id: string;
			messageCount: number;
			title: string | null;
		};
		meta: {
			model: string;
			latencyMs: number;
		};
	}> {
		const session = await this.repository.getSession(patientId, sessionId);
		if (!session) {
			throw new Error('Chat session not found.');
		}

		const maxMessages = 200;
		if (session.messageCount >= maxMessages) {
			throw new Error(
				'This session has reached the maximum of 200 messages. Please start a new session.',
			);
		}

		const userMessage = await this.repository.createMessage(
			sessionId,
			'user',
			content,
		);

		const prevMessageCount = session.messageCount;
		let autoTitle: string | undefined;

		if (prevMessageCount === 0) {
			autoTitle =
				content.length > 100 ? content.slice(0, 97) + '...' : content;
		}

		await this.repository.incrementMessageCount(sessionId, autoTitle);

		const recentMessages = await this.repository.getRecentMessages(
			sessionId,
			15,
		);

		const aiRequestMessages = await this.buildChatRequest(
			patientId,
			recentMessages,
		);

		const startTime = Date.now();
		let aiResponse;

		try {
			aiResponse = await this.aiProvider.chat({
				messages: aiRequestMessages,
				temperature: 0.2,
			});
		} catch (error) {
			this.logger.error(error, 'AI chat provider failed.');
			throw new Error(
				'The AI assistant is temporarily unavailable. Please try again.',
			);
		}

		const latencyMs = Date.now() - startTime;

		const assistantMessage = await this.repository.createMessage(
			sessionId,
			'assistant',
			aiResponse.content,
			{
				model: aiResponse.model,
				latencyMs,
			},
		);

		const updatedSession = await this.repository.getSession(
			patientId,
			sessionId,
		);

		return {
			userMessage: {
				id: userMessage.id,
				role: userMessage.role,
				content: userMessage.content,
				createdAt: userMessage.createdAt,
			},
			assistantMessage: {
				id: assistantMessage.id,
				role: assistantMessage.role,
				content: assistantMessage.content,
				createdAt: assistantMessage.createdAt,
			},
			session: {
				id: sessionId,
				messageCount: updatedSession?.messageCount ?? prevMessageCount + 1,
				title: updatedSession?.title ?? autoTitle ?? null,
			},
			meta: {
				model: aiResponse.model,
				latencyMs,
			},
		};
	}

	private async buildChatRequest(
		patientId: string,
		recentMessages: Array<{ role: string; content: string }>,
	) {
		const identity = await this.fetchPatientContext(patientId);

		const systemPrompt = `You are a supportive AI health assistant for the Sijill patient app.

RULES:
- Only use the patient's medical data provided below. Never invent diagnoses, medications, or test results.
- Never tell the patient to start, stop, or change prescription medications.
- If the question requires medical advice beyond explaining their data, suggest consulting their doctor.
- If you detect potential emergency signs, say to seek immediate medical care.
- Be concise, warm, and practical.
- Reply in the same language as the user's question.
- If you cannot answer from the provided data, say so honestly.

PATIENT DATA:
${JSON.stringify(identity, null, 2)}`;

		const messages: Array<{
			role: 'system' | 'user' | 'assistant';
			content: string;
		}> = [{ role: 'system', content: systemPrompt }];

		for (const msg of recentMessages) {
			messages.push({
				role: msg.role as 'user' | 'assistant',
				content: msg.content,
			});
		}

		return messages;
	}

	private async fetchPatientContext(patientId: string) {
		const { rows: patientRows } = await this.databaseService.query(
			`SELECT
			   p.gender, p.date_of_birth, p.blood_type
			 FROM patients p
			 WHERE p.id = $1`,
			[patientId],
		);

		const patient = patientRows[0];
		const age = patient
			? Math.floor(
					(Date.now() - new Date(patient.date_of_birth).getTime()) /
						(365.25 * 24 * 60 * 60 * 1000),
				)
			: null;

		const { rows: diagnoses } = await this.databaseService.query(
			`SELECT d.icd11_title, d.icd11_code, d.clinical_description, d.status
			 FROM diagnoses d
			 WHERE d.patient_id = $1 AND (d.status = 'ACTIVE' OR d.status IS NULL)
			 ORDER BY d.diagnosed_date DESC`,
			[patientId],
		);

		const { rows: medications } = await this.databaseService.query(
			`SELECT m.medication_name, m.dosage_amount, m.dosage_unit, m.form, m.frequency, m.instructions, m.start_date, m.end_date
			 FROM medications m
			 WHERE m.patient_id = $1
			 ORDER BY m.created_at DESC`,
			[patientId],
		);

		const { rows: allergies } = await this.databaseService.query(
			`SELECT allergen_name, severity, reaction_description
			 FROM patient_allergies
			 WHERE patient_id = $1`,
			[patientId],
		);

		return {
			basicInfo: patient
				? {
						age,
						gender: patient.gender,
						bloodType: patient.blood_type,
					}
				: null,
			activeDiagnoses: diagnoses,
			currentMedications: medications,
			allergies,
		};
	}
}
