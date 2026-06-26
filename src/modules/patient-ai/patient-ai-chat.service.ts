import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DatabaseService } from '@db/database.service';
import { OrderType } from '@common/enums/db.enum';
import { loadPatientMedicalIdentity } from '@modules/patient/patient-medical-identity.query';
import { PatientAIRepository } from './patient-ai.repository';
import type { AiProvider } from './interfaces/ai-provider.interface';

interface ChatHistoryMessage {
	role: string;
	content: string;
}

interface ContextDocumentReference {
	documentId: string;
	fileName: string | null;
	mimeType: string | null;
	fileSizeBytes: number | null;
	uploadedAt: Date | null;
}

interface ResultReportContext {
	kind: 'LAB' | 'IMAGING';
	orderId: string;
	orderStatus: string | null;
	orderedAt: Date | null;
	title: string | null;
	clinicalIndication: string | null;
	priority: string | null;
	result: {
		uploadedAt: Date | null;
		summary: string | Record<string, unknown> | null;
		additionalNotes: string | null;
		documents: ContextDocumentReference[];
	} | null;
}

interface RecentEncounterContext {
	encounterId: string;
	hcpFullName: string | null;
	hcpSpecialization: string | null;
	encounterDate: Date | null;
	locationAddress: string | null;
	appointmentNotes: string | null;
	symptoms: string[];
	diagnoses: Array<{
		diagnosisId: string;
		icd11Code: string | null;
		icd11Title: string | null;
		clinicalDescription: string | null;
		isChronic: boolean;
		status: string;
	}>;
	prescribedMedications: Array<{
		medicationName: string | null;
		dosageAmount: number | null;
		dosageUnit: string | null;
		form: string | null;
		frequency: string | null;
		instructions: string | null;
		startDate: string | null;
		endDate: string | null;
	}>;
}

interface RecentHealthNoteContext {
	noteId: string;
	diagnosisId: string;
	diagnosisTitle: string | null;
	noteDate: string;
	patientOutcome: string | null;
	patientOutcomeDetails: string | null;
	mood: string | null;
	painLevel: number | null;
	energyLevel: number | null;
	createdAt: Date;
}

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
			autoTitle = content.length > 100 ? content.slice(0, 97) + '...' : content;
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
		recentMessages: ChatHistoryMessage[],
	) {
		const context = await this.fetchPatientContext(patientId);

		const systemPrompt = `You are a supportive AI health assistant for the Sijill patient app.

RULES:
- Only use the patient's medical data provided below. Never invent diagnoses, medications, test results, or document contents.
- You may summarize encounters, explain prescribed medications, and interpret lab/imaging results using the structured result data and notes provided below.
- If a report attachment is present without readable text or structured result data, explain that you can only interpret the recorded findings or summary fields.
- Never tell the patient to start, stop, or change prescription medications.
- If the question requires medical advice beyond explaining their data, suggest consulting their doctor.
- If you detect potential emergency signs, say to seek immediate medical care.
- Be concise, warm, and practical.
- Reply in the same language as the user's question.
- If you cannot answer from the provided data, say so honestly.

PATIENT DATA:
${JSON.stringify(context, null, 2)}`;

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
		const [
			medicalIdentity,
			activeOrdersResult,
			recentEncountersResult,
			recentHealthNotesResult,
			labResultsResult,
			imagingResultsResult,
		] = await Promise.all([
			loadPatientMedicalIdentity(this.databaseService, patientId),
			this.databaseService.query(
				`
					SELECT
						mo.id AS order_id,
						mo.order_type,
						mo.order_status,
						mo.ordered_at,
						COALESCE(lo.priority, io.priority) AS priority,
						COALESCE(lo.clinical_indication, io.clinical_indication) AS clinical_indication,
						rt.name AS test_type,
						rs.name AS specimen_type,
						ri.name AS imaging_type,
						rb.name AS body_part
					FROM medical_orders mo
					LEFT JOIN lab_orders lo ON lo.medical_order_id = mo.id
					LEFT JOIN ref_test_types rt ON rt.id = lo.test_type_id
					LEFT JOIN ref_specimen_types rs ON rs.id = lo.specimen_type_id
					LEFT JOIN imaging_orders io ON io.medical_order_id = mo.id
					LEFT JOIN ref_imaging_types ri ON ri.id = io.imaging_type_id
					LEFT JOIN ref_body_parts rb ON rb.id = io.body_part_id
					WHERE mo.patient_id = $1
						AND mo.order_status IN ($2, $3)
					ORDER BY mo.ordered_at DESC NULLS LAST, mo.created_at DESC
				`,
				[patientId, 'PENDING', 'IN_PROGRESS'],
			),
			this.databaseService.query(
				`
					SELECT
						ce.id AS encounter_id,
						TRIM(CONCAT_WS(' ', h.first_name, h.middle_name, h.surname)) AS hcp_full_name,
						h.specialization AS hcp_specialization,
						ce.encounter_date,
						ce.location_address,
						ce.appointment_notes,
						COALESCE(symptoms.symptoms, ARRAY[]::VARCHAR[]) AS symptoms,
						COALESCE(encounter_diagnoses.diagnoses, '[]'::json) AS diagnoses,
						COALESCE(encounter_medications.medications, '[]'::json) AS prescribed_medications
					FROM clinical_encounters ce
					LEFT JOIN healthcare_providers h ON h.id = ce.hcp_id
					LEFT JOIN LATERAL (
						SELECT ARRAY_AGG(title ORDER BY created_at ASC) AS symptoms
						FROM encounter_symptoms_complaints
						WHERE encounter_id = ce.id
					) symptoms ON TRUE
					LEFT JOIN LATERAL (
						SELECT JSON_AGG(
							JSON_BUILD_OBJECT(
								'diagnosisId', id,
								'icd11Code', icd11_code,
								'icd11Title', icd11_title,
								'clinicalDescription', clinical_description,
								'isChronic', is_chronic,
								'status', COALESCE(status, $2)
							)
							ORDER BY created_at ASC
						) AS diagnoses
						FROM diagnoses
						WHERE encounter_id = ce.id
					) encounter_diagnoses ON TRUE
					LEFT JOIN LATERAL (
						SELECT JSON_AGG(
							JSON_BUILD_OBJECT(
								'medicationName', medication_name,
								'dosageAmount', dosage_amount,
								'dosageUnit', dosage_unit,
								'form', form,
								'frequency', frequency,
								'instructions', instructions,
								'startDate', start_date,
								'endDate', end_date
							)
							ORDER BY created_at ASC
						) AS medications
						FROM medications
						WHERE encounter_id = ce.id
					) encounter_medications ON TRUE
					WHERE ce.patient_id = $1
					ORDER BY ce.encounter_date DESC NULLS LAST, ce.created_at DESC
					LIMIT 5
				`,
				[patientId, 'ACTIVE'],
			),
			this.databaseService.query(
				`
					SELECT
						n.id AS note_id,
						n.diagnosis_id,
						d.icd11_title AS diagnosis_title,
						n.note_date,
						n.patient_outcome,
						n.patient_outcome_details,
						n.mood,
						n.pain_level,
						n.energy_level,
						n.created_at
					FROM patient_health_notes n
					INNER JOIN diagnoses d ON d.id = n.diagnosis_id
					WHERE n.patient_id = $1
					ORDER BY n.note_date DESC, n.created_at DESC
					LIMIT 10
				`,
				[patientId],
			),
			this.databaseService.query(
				`
					SELECT
						mo.id AS order_id,
						mo.order_status,
						mo.ordered_at,
						rt.name AS test_type,
						rs.name AS specimen_type,
						lo.priority,
						lo.clinical_indication,
						lr.id AS result_id,
						lr.result_data,
						lr.additional_notes,
						lr.uploaded_at,
						COALESCE(documents.documents, '[]'::json) AS documents
					FROM medical_orders mo
					INNER JOIN lab_orders lo ON lo.medical_order_id = mo.id
					LEFT JOIN ref_test_types rt ON rt.id = lo.test_type_id
					LEFT JOIN ref_specimen_types rs ON rs.id = lo.specimen_type_id
					LEFT JOIN LATERAL (
						SELECT *
						FROM lab_results
						WHERE order_id = mo.id
						ORDER BY uploaded_at DESC NULLS LAST, id DESC
						LIMIT 1
					) lr ON TRUE
					LEFT JOIN LATERAL (
						SELECT JSON_AGG(
							JSON_BUILD_OBJECT(
								'documentId', d.id,
								'fileName', d.file_name,
								'mimeType', d.mime_type,
								'fileSizeBytes', d.file_size_bytes,
								'uploadedAt', d.uploaded_at
							)
							ORDER BY d.uploaded_at DESC NULLS LAST, d.id DESC
						) AS documents
						FROM lab_result_documents lrd
						INNER JOIN documents d ON d.id = lrd.document_id
						WHERE lrd.lab_result_id = lr.id
					) documents ON TRUE
					WHERE mo.patient_id = $1
						AND mo.order_type = $2
						AND lr.id IS NOT NULL
					ORDER BY lr.uploaded_at DESC NULLS LAST, mo.created_at DESC
					LIMIT 8
				`,
				[patientId, OrderType.LABORATORY],
			),
			this.databaseService.query(
				`
					SELECT
						mo.id AS order_id,
						mo.order_status,
						mo.ordered_at,
						ri.name AS imaging_type,
						rb.name AS body_part,
						io.priority,
						io.contrast_used,
						io.clinical_indication,
						ir.id AS result_id,
						ir.study_description,
						ir.findings,
						ir.uploaded_at,
						COALESCE(documents.documents, '[]'::json) AS documents
					FROM medical_orders mo
					INNER JOIN imaging_orders io ON io.medical_order_id = mo.id
					LEFT JOIN ref_imaging_types ri ON ri.id = io.imaging_type_id
					LEFT JOIN ref_body_parts rb ON rb.id = io.body_part_id
					LEFT JOIN LATERAL (
						SELECT *
						FROM imaging_results
						WHERE order_id = mo.id
						ORDER BY uploaded_at DESC NULLS LAST, id DESC
						LIMIT 1
					) ir ON TRUE
					LEFT JOIN LATERAL (
						SELECT JSON_AGG(
							JSON_BUILD_OBJECT(
								'documentId', d.id,
								'fileName', d.file_name,
								'mimeType', d.mime_type,
								'fileSizeBytes', d.file_size_bytes,
								'uploadedAt', d.uploaded_at
							)
							ORDER BY d.uploaded_at DESC NULLS LAST, d.id DESC
						) AS documents
						FROM imaging_result_documents ird
						INNER JOIN documents d ON d.id = ird.document_id
						WHERE ird.imaging_result_id = ir.id
					) documents ON TRUE
					WHERE mo.patient_id = $1
						AND mo.order_type = $2
						AND ir.id IS NOT NULL
					ORDER BY ir.uploaded_at DESC NULLS LAST, mo.created_at DESC
					LIMIT 8
				`,
				[patientId, OrderType.IMAGING],
			),
		]);

		const recentResultReports: ResultReportContext[] = [
			...labResultsResult.rows.map((row) => ({
				kind: 'LAB' as const,
				orderId: row.order_id,
				orderStatus: row.order_status,
				orderedAt: row.ordered_at,
				title: row.test_type ?? row.specimen_type ?? 'Lab result',
				clinicalIndication: row.clinical_indication,
				priority: row.priority,
				result: row.result_id
					? {
							uploadedAt: row.uploaded_at,
							summary: row.result_data,
							additionalNotes: row.additional_notes,
							documents: this.mapContextDocuments(row.documents),
						}
					: null,
			})),
			...imagingResultsResult.rows.map((row) => ({
				kind: 'IMAGING' as const,
				orderId: row.order_id,
				orderStatus: row.order_status,
				orderedAt: row.ordered_at,
				title: row.imaging_type ?? row.body_part ?? 'Imaging result',
				clinicalIndication: row.clinical_indication,
				priority: row.priority,
				result: row.result_id
					? {
							uploadedAt: row.uploaded_at,
							summary: {
								studyDescription: row.study_description,
								findings: row.findings,
								contrastUsed: row.contrast_used,
							},
							additionalNotes: null,
							documents: this.mapContextDocuments(row.documents),
						}
					: null,
			})),
		]
			.sort((left, right) => {
				const leftTime = this.toTime(left.result?.uploadedAt ?? left.orderedAt);
				const rightTime = this.toTime(
					right.result?.uploadedAt ?? right.orderedAt,
				);
				return rightTime - leftTime;
			})
			.slice(0, 10);

		return {
			medicalIdentity,
			activeMedicalOrders: activeOrdersResult.rows.map((row) => ({
				orderId: row.order_id,
				orderType: row.order_type,
				orderStatus: row.order_status,
				orderedAt: row.ordered_at,
				priority: row.priority,
				clinicalIndication: row.clinical_indication,
				testType: row.test_type,
				specimenType: row.specimen_type,
				imagingType: row.imaging_type,
				bodyPart: row.body_part,
			})),
			recentEncounters: recentEncountersResult.rows.map((row) => ({
				encounterId: row.encounter_id,
				hcpFullName: row.hcp_full_name,
				hcpSpecialization: row.hcp_specialization,
				encounterDate: row.encounter_date,
				locationAddress: row.location_address,
				appointmentNotes: row.appointment_notes,
				symptoms: row.symptoms ?? [],
				diagnoses: Array.isArray(row.diagnoses) ? row.diagnoses : [],
				prescribedMedications: Array.isArray(row.prescribed_medications)
					? row.prescribed_medications
					: [],
			})),
			recentHealthJournalNotes: recentHealthNotesResult.rows.map((row) => ({
				noteId: row.note_id,
				diagnosisId: row.diagnosis_id,
				diagnosisTitle: row.diagnosis_title,
				noteDate: row.note_date,
				patientOutcome: row.patient_outcome,
				patientOutcomeDetails: row.patient_outcome_details,
				mood: row.mood,
				painLevel: row.pain_level !== null ? Number(row.pain_level) : null,
				energyLevel:
					row.energy_level !== null ? Number(row.energy_level) : null,
				createdAt: row.created_at,
			})),
			recentResultReports,
		};
	}

	private mapContextDocuments(value: unknown): ContextDocumentReference[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.map((item) => {
				if (!item || typeof item !== 'object') {
					return null;
				}

				const document = item as Record<string, unknown>;
				return {
					documentId:
						typeof document.documentId === 'string' ? document.documentId : '',
					fileName:
						typeof document.fileName === 'string' ? document.fileName : null,
					mimeType:
						typeof document.mimeType === 'string' ? document.mimeType : null,
					fileSizeBytes:
						typeof document.fileSizeBytes === 'number'
							? document.fileSizeBytes
							: null,
					uploadedAt:
						document.uploadedAt instanceof Date
							? document.uploadedAt
							: document.uploadedAt
								? new Date(String(document.uploadedAt))
								: null,
				};
			})
			.filter((document): document is ContextDocumentReference => {
				return document !== null && document.documentId.length > 0;
			});
	}

	private toTime(value: Date | string | null | undefined) {
		if (!value) {
			return 0;
		}

		const date = value instanceof Date ? value : new Date(value);
		return Number.isNaN(date.getTime()) ? 0 : date.getTime();
	}
}
