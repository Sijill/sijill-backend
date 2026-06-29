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
				signal: AbortSignal.timeout(120000),
				body: JSON.stringify({
					model,
					messages: [
						{
							role: 'system',
							content:
								'Return valid JSON with a single "note" field. Never mention being an AI or a health assistant.',
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
Patient name: ${context.medicalIdentity.basicInfo.firstName}
Pain: ${currentNote.painLevel}/10
Energy: ${currentNote.energyLevel}/10
Outcome: ${currentNote.patientOutcome}
Mood: ${currentNote.mood}
Diagnosis: ${currentNote.diagnosis.icd11Title}
Medications: ${JSON.stringify(context.medicalIdentity.currentMedications.map(m => m.medicationName).filter(Boolean))}

Write 2 sentences addressing the patient directly. Example: "Your pain is high, please see your doctor." Return JSON: {"note": "..."}
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

		if (flattened.length <= 500) {
			return flattened;
		}

		return `${flattened.slice(0, 497).trimEnd()}...`;
	}
}
