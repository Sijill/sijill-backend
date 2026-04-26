import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type {
	CreatedHealthJournalEntry,
	PatientHealthJournalSnapshotContext,
} from './patient.repository';

export type HealthSnapshotUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export interface PatientHealthSnapshot {
	status: 'READY' | 'UNAVAILABLE';
	model: string | null;
	urgencyLevel: HealthSnapshotUrgency;
	summary: string | null;
	advice: string[];
	watchouts: string[];
	whenToContactDoctor: string[];
	disclaimer: string;
	unavailableReason?: string;
}

interface GeminiGenerateContentResponse {
	candidates?: Array<{
		content?: {
			parts?: Array<{
				text?: string;
			}>;
		};
	}>;
}

interface ParsedHealthSnapshot {
	urgencyLevel?: string;
	summary?: string;
	advice?: unknown;
	watchouts?: unknown;
	whenToContactDoctor?: unknown;
	disclaimer?: string;
}

@Injectable()
export class PatientHealthSnapshotService {
	private readonly defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

	constructor(private readonly logger: PinoLogger) {
		this.logger.setContext(PatientHealthSnapshotService.name);
	}

	async generateHealthSnapshot(input: {
		context: PatientHealthJournalSnapshotContext;
		currentNote: CreatedHealthJournalEntry;
	}): Promise<PatientHealthSnapshot> {
		const apiKey = process.env.GEMINI_API_KEY;
		const model = process.env.GEMINI_MODEL || this.defaultModel;

		if (!apiKey) {
			return this.createUnavailableSnapshot(
				'Set GEMINI_API_KEY to enable AI health snapshots.',
				model,
			);
		}

		try {
			const response = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						contents: [
							{
								role: 'user',
								parts: [
									{
										text: this.buildPrompt(input.context, input.currentNote),
									},
								],
							},
						],
						generationConfig: {
							temperature: 0.2,
							responseMimeType: 'application/json',
						},
					}),
				},
			);

			if (!response.ok) {
				const errorBody = await response.text();
				this.logger.warn(
					{
						status: response.status,
						body: errorBody,
					},
					'Gemini health snapshot request failed.',
				);

				return this.createUnavailableSnapshot(
					'The AI health snapshot service could not respond right now.',
					model,
				);
			}

			const payload =
				(await response.json()) as GeminiGenerateContentResponse;
			const rawText = this.extractResponseText(payload);
			const parsed = this.parseSnapshot(rawText);

			if (!parsed) {
				this.logger.warn(
					{ rawText },
					'Gemini returned an unexpected health snapshot payload.',
				);
				return this.createUnavailableSnapshot(
					'The AI health snapshot service returned an unexpected response.',
					model,
				);
			}

			return {
				status: 'READY',
				model,
				urgencyLevel: this.normalizeUrgency(parsed.urgencyLevel),
				summary: parsed.summary?.trim() || null,
				advice: this.normalizeList(parsed.advice),
				watchouts: this.normalizeList(parsed.watchouts),
				whenToContactDoctor: this.normalizeList(
					parsed.whenToContactDoctor,
				),
				disclaimer:
					parsed.disclaimer?.trim() ||
					'This snapshot is supportive guidance only and does not replace your clinician.',
			};
		} catch (error) {
			this.logger.error(error, 'Gemini health snapshot request crashed.');
			return this.createUnavailableSnapshot(
				'The AI health snapshot service is temporarily unavailable.',
				model,
			);
		}
	}

	createUnavailableSnapshot(
		reason: string,
		model: string | null = process.env.GEMINI_MODEL || this.defaultModel,
	): PatientHealthSnapshot {
		return {
			status: 'UNAVAILABLE',
			model,
			urgencyLevel: 'UNKNOWN',
			summary: null,
			advice: [],
			watchouts: [],
			whenToContactDoctor: [],
			disclaimer:
				'This snapshot is unavailable right now and does not replace medical care.',
			unavailableReason: reason,
		};
	}

	private buildPrompt(
		context: PatientHealthJournalSnapshotContext,
		currentNote: CreatedHealthJournalEntry,
	) {
		return `
You are creating a patient-facing health snapshot for a healthcare app.

Rules:
- Use only the medical data provided below.
- Do not invent new diagnoses, medications, orders, or test results.
- Do not tell the patient to start, stop, or change prescription medications on their own.
- Keep the tone calm, practical, and supportive.
- If the information suggests elevated concern, say so clearly and recommend contacting the treating clinician.
- If there are emergency-style warning signs in the provided data, say the patient should seek urgent or emergency care immediately.
- Return strict JSON with this shape only:
{
  "urgencyLevel": "LOW" | "MEDIUM" | "HIGH",
  "summary": "short paragraph",
  "advice": ["2 to 5 short bullets"],
  "watchouts": ["0 to 4 short bullets"],
  "whenToContactDoctor": ["0 to 4 short bullets"],
  "disclaimer": "one sentence"
}

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

	private extractResponseText(payload: GeminiGenerateContentResponse) {
		return (
			payload.candidates?.[0]?.content?.parts
				?.map((part) => part.text || '')
				.join('')
				.trim() || ''
		);
	}

	private parseSnapshot(rawText: string): ParsedHealthSnapshot | null {
		if (!rawText) {
			return null;
		}

		const normalized = rawText
			.replace(/^```json\s*/i, '')
			.replace(/^```\s*/i, '')
			.replace(/\s*```$/i, '')
			.trim();

		try {
			return JSON.parse(normalized) as ParsedHealthSnapshot;
		} catch (error) {
			this.logger.warn({ rawText, error }, 'Unable to parse Gemini JSON.');
			return null;
		}
	}

	private normalizeUrgency(value?: string): HealthSnapshotUrgency {
		if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH') {
			return value;
		}

		return 'UNKNOWN';
	}

	private normalizeList(value: unknown) {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map((item) => (typeof item === 'string' ? item.trim() : ''))
			.filter((item) => item.length > 0);
	}
}
