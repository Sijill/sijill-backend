import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type {
	CreatedHealthJournalEntry,
	PatientHealthJournalSnapshotContext,
} from './patient.repository';

export interface PatientHealthSnapshot {
	note: string;
}

interface OllamaChatResponse {
	message?: {
		content?: string;
	};
}

interface ParsedHealthSnapshotNote {
	note?: string;
}

@Injectable()
export class PatientHealthSnapshotService {
	private readonly defaultModel = process.env.OLLAMA_MODEL || 'llama3.1:8b';

	constructor(private readonly logger: PinoLogger) {
		this.logger.setContext(PatientHealthSnapshotService.name);
	}

	async generateHealthSnapshot(input: {
		context: PatientHealthJournalSnapshotContext;
		currentNote: CreatedHealthJournalEntry;
	}): Promise<PatientHealthSnapshot> {
		const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
		const model = process.env.OLLAMA_MODEL || this.defaultModel;

		try {
			const response = await fetch(`${baseUrl}/api/chat`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				signal: AbortSignal.timeout(60000),
				body: JSON.stringify({
					model,
					messages: [
						{
							role: 'system',
							content:
								'You write gentle patient-facing health notes for a healthcare app. Return only valid JSON with a single note field.',
						},
						{
							role: 'user',
							content: this.buildPrompt(input.context, input.currentNote),
						},
					],
					stream: false,
					format: 'json',
					options: {
						temperature: 0.2,
					},
				}),
			});

			if (!response.ok) {
				const errorBody = await response.text();
				this.logger.warn(
					{
						status: response.status,
						body: errorBody,
						model,
					},
					'Ollama health note request failed.',
				);

				return this.createUnavailableSnapshot();
			}

			const payload = (await response.json()) as OllamaChatResponse;
			const note = this.extractNote(payload.message?.content);

			if (!note) {
				this.logger.warn(
					{ payload, model },
					'Ollama returned an unexpected health note payload.',
				);

				return this.createUnavailableSnapshot();
			}

			return { note };
		} catch (error) {
			this.logger.error(error, 'Ollama health note request crashed.');
			return this.createUnavailableSnapshot();
		}
	}

	createUnavailableSnapshot(_reason?: string): PatientHealthSnapshot {
		return {
			note: "You're making steady progress by checking in with yourself. Keep following your care plan, and if symptoms feel worse or unusual, contact your clinician.",
		};
	}

	private buildPrompt(
		context: PatientHealthJournalSnapshotContext,
		currentNote: CreatedHealthJournalEntry,
	) {
		return `
Write a short patient-facing health note for a healthcare app.

Rules:
- Return strict JSON with exactly one field: "note".
- The note must be one short paragraph with 1 to 3 sentences.
- No bullets, headings, markdown, or extra commentary.
- Keep the tone warm, calm, practical, and encouraging.
- Use only the medical data provided below.
- Do not invent diagnoses, medications, or test results.
- Do not tell the patient to start, stop, or change prescription medications.
- If the information suggests elevated concern, gently recommend contacting the treating clinician.
- If emergency warning signs are present in the data, say the patient should seek urgent or emergency care immediately.

Patient context:
${JSON.stringify(
	{
		patientBasicInfo: context.medicalIdentity.basicInfo,
		allergies: context.medicalIdentity.allergies,
		chronicConditions: context.medicalIdentity.chronicConditions,
		activeDiagnoses: context.medicalIdentity.activeDiagnoses,
		selectedDiagnosis: context.selectedDiagnosis,
		activeMedications: context.medicalIdentity.currentMedications,
		activeMedicalOrders: context.activeMedicalOrders,
		lastFiveEncounters: context.recentEncounters,
		previousHealthJournalNotes: context.previousHealthNotes,
		currentHealthJournalNote: currentNote,
	},
	null,
	2,
)}
		`.trim();
	}

	private extractNote(rawText?: string) {
		if (!rawText) {
			return null;
		}

		const normalized = rawText
			.replace(/^```json\s*/i, '')
			.replace(/^```\s*/i, '')
			.replace(/\s*```$/i, '')
			.trim();

		try {
			const parsed = JSON.parse(normalized) as ParsedHealthSnapshotNote;
			if (typeof parsed.note === 'string') {
				return this.normalizeNote(parsed.note);
			}
		} catch {
			// Fallback to the raw text below.
		}

		return this.normalizeNote(normalized);
	}

	private normalizeNote(note: string) {
		const flattened = note.replace(/\s+/g, ' ').trim();

		if (!flattened) {
			return null;
		}

		if (flattened.length <= 320) {
			return flattened;
		}

		return `${flattened.slice(0, 317).trimEnd()}...`;
	}
}
