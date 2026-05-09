import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DatabaseService } from '@db/database.service';
import {
	DiagnosisStatus,
	NotificationStatus,
	OrderStatus,
	ReminderType,
} from '@common/enums/db.enum';
import { PoolClient } from 'pg';
import {
	loadPatientMedicalIdentity,
	type PatientMedicalIdentitySnapshot,
} from './patient-medical-identity.query';
import { CreateHealthJournalEntryDto } from './dto/create-health-journal-entry.dto';
import { AddEmergencyContactDto } from './dto/add-emergency-contact.dto';

export interface ActiveDiagnosisJournalOption {
	diagnosisId: string;
	icd11Code: string | null;
	icd11Title: string | null;
	clinicalDescription: string | null;
	isChronic: boolean;
	diagnosedBy: string | null;
	diagnosedDate: Date | null;
}

export interface CreatedHealthJournalEntry {
	noteId: string;
	patientId: string;
	diagnosisId: string;
	noteDate: string;
	patientOutcome: string | null;
	patientOutcomeDetails: string | null;
	mood: string | null;
	painLevel: number | null;
	energyLevel: number | null;
	createdAt: Date;
	updatedAt: Date;
	diagnosis: ActiveDiagnosisJournalOption;
}

export interface PatientHealthJournalSnapshotContext {
	medicalIdentity: PatientMedicalIdentitySnapshot;
	selectedDiagnosis: {
		diagnosisId: string;
		icd11Code: string | null;
		icd11Title: string | null;
		clinicalDescription: string | null;
		isChronic: boolean;
		status: string;
		diagnosedDate: Date | null;
	};
	activeMedicalOrders: Array<{
		orderId: string;
		orderType: string | null;
		orderStatus: string | null;
		orderedAt: Date | null;
		priority: string | null;
		clinicalIndication: string | null;
		testType: string | null;
		specimenType: string | null;
		imagingType: string | null;
		bodyPart: string | null;
	}>;
	recentEncounters: Array<{
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
	}>;
	previousHealthNotes: Array<{
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
	}>;
}

export interface PatientMedicalHistoryEncounterSummary {
	encounterId: string;
	doctorName: string | null;
	doctorSpeciality: string | null;
	encounterDate: Date | null;
	location: string | null;
	primaryDiagnosis: {
		icd11Code: string | null;
		icd11Title: string | null;
	} | null;
}

export interface PatientMedicalHistoryEncounterDetail
	extends PatientMedicalHistoryEncounterSummary {
	symptomsAndComplaints: Array<{
		title: string;
		description: string | null;
	}>;
	diagnoses: Array<{
		icd11Code: string | null;
		icd11Title: string | null;
		clinicalDescription: string | null;
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

@Injectable()
export class PatientRepository {
	constructor(
		private readonly databaseService: DatabaseService,
		private readonly logger: PinoLogger,
	) {
		this.logger.setContext(PatientRepository.name);
	}

	async getPatientByUserId(userId: string) {
		const { rows } = await this.databaseService.query(
			`
				SELECT id, user_id
				FROM patients
				WHERE user_id = $1
			`,
			[userId],
		);

		return rows[0] ?? null;
	}

	async getMedicalIdentity(
		patientId: string,
	): Promise<PatientMedicalIdentitySnapshot> {
		return await loadPatientMedicalIdentity(this.databaseService, patientId);
	}

	async listMedicalHistory(
		patientId: string,
	): Promise<PatientMedicalHistoryEncounterSummary[]> {
		const { rows } = await this.databaseService.query(
			`
				SELECT
					ce.id AS encounter_id,
					TRIM(CONCAT_WS(' ', h.first_name, h.middle_name, h.surname)) AS doctor_name,
					h.specialization AS doctor_speciality,
					ce.encounter_date,
					ce.location_address,
					primary_diagnosis.icd11_code,
					primary_diagnosis.icd11_title
				FROM clinical_encounters ce
				LEFT JOIN healthcare_providers h ON h.id = ce.hcp_id
				LEFT JOIN LATERAL (
					SELECT icd11_code, icd11_title
					FROM diagnoses
					WHERE encounter_id = ce.id
					ORDER BY created_at ASC
					LIMIT 1
				) primary_diagnosis ON TRUE
				WHERE ce.patient_id = $1
				ORDER BY ce.encounter_date DESC NULLS LAST, ce.created_at DESC
			`,
			[patientId],
		);

		return rows.map((row) => this.mapMedicalHistorySummary(row));
	}

	async getMedicalHistoryEncounter(
		patientId: string,
		encounterId: string,
	): Promise<PatientMedicalHistoryEncounterDetail | null> {
		const { rows } = await this.databaseService.query(
			`
				SELECT
					ce.id AS encounter_id,
					TRIM(CONCAT_WS(' ', h.first_name, h.middle_name, h.surname)) AS doctor_name,
					h.specialization AS doctor_speciality,
					ce.encounter_date,
					ce.location_address,
					primary_diagnosis.icd11_code,
					primary_diagnosis.icd11_title
				FROM clinical_encounters ce
				LEFT JOIN healthcare_providers h ON h.id = ce.hcp_id
				LEFT JOIN LATERAL (
					SELECT icd11_code, icd11_title
					FROM diagnoses
					WHERE encounter_id = ce.id
					ORDER BY created_at ASC
					LIMIT 1
				) primary_diagnosis ON TRUE
				WHERE ce.id = $1
					AND ce.patient_id = $2
			`,
			[encounterId, patientId],
		);

		const encounter = rows[0];
		if (!encounter) {
			return null;
		}

		const [symptomsResult, diagnosesResult, medicationsResult] =
			await Promise.all([
				this.databaseService.query(
					`
						SELECT title, description
						FROM encounter_symptoms_complaints
						WHERE encounter_id = $1
						ORDER BY created_at ASC
					`,
					[encounterId],
				),
				this.databaseService.query(
					`
						SELECT
							icd11_code,
							icd11_title,
							clinical_description
						FROM diagnoses
						WHERE encounter_id = $1
						ORDER BY created_at ASC
					`,
					[encounterId],
				),
				this.databaseService.query(
					`
						SELECT
							medication_name,
							dosage_amount,
							dosage_unit,
							form,
							frequency,
							instructions,
							start_date,
							end_date
						FROM medications
						WHERE encounter_id = $1
						ORDER BY created_at ASC
					`,
					[encounterId],
				),
			]);

		return {
			...this.mapMedicalHistorySummary(encounter),
			symptomsAndComplaints: symptomsResult.rows.map((row) => ({
				title: row.title,
				description: row.description,
			})),
			diagnoses: diagnosesResult.rows.map((row) => ({
				icd11Code: row.icd11_code,
				icd11Title: row.icd11_title,
				clinicalDescription: row.clinical_description,
			})),
			prescribedMedications: medicationsResult.rows.map((row) => ({
				medicationName: row.medication_name,
				dosageAmount:
					row.dosage_amount !== null ? Number(row.dosage_amount) : null,
				dosageUnit: row.dosage_unit,
				form: row.form,
				frequency: row.frequency,
				instructions: row.instructions,
				startDate: this.formatDateOnly(row.start_date),
				endDate: this.formatDateOnly(row.end_date),
			})),
		};
	}

	async listActiveReminders(patientId: string) {
		const { rows } = await this.databaseService.query(
			`
				SELECT
					r.id AS reminder_id,
					r.reminder_type,
					r.medication_id,
					r.medical_order_id,
					r.encounter_id,
					r.starts_at,
					r.ends_at,
					r.appointment_at,
					r.reminder_time,
					r.custom_days,
					r.is_active,
					r.dismissed_at,
					r.created_at,
					r.updated_at,
					m.medication_name,
					m.dosage_amount,
					m.dosage_unit,
					m.form,
					m.frequency,
					m.start_date,
					m.end_date,
					TRIM(CONCAT_WS(' ', med_h.first_name, med_h.middle_name, med_h.surname)) AS medication_prescribed_by,
					ce.location_address,
					ce.appointment_notes,
					TRIM(CONCAT_WS(' ', appt_h.first_name, appt_h.middle_name, appt_h.surname)) AS appointment_doctor_name,
					mo.order_type,
					mo.order_status,
					mo.ordered_at,
					TRIM(CONCAT_WS(' ', order_h.first_name, order_h.middle_name, order_h.surname)) AS order_doctor_name,
					COALESCE(lo.priority, io.priority) AS order_priority,
					COALESCE(rt.name, ri.name) AS order_name,
					rs.name AS specimen_type,
					rb.name AS body_part
				FROM reminders r
				LEFT JOIN medications m ON m.id = r.medication_id
				LEFT JOIN healthcare_providers med_h ON med_h.id = m.prescribed_by_hcp_id
				LEFT JOIN clinical_encounters ce ON ce.id = r.encounter_id
				LEFT JOIN healthcare_providers appt_h ON appt_h.id = ce.hcp_id
				LEFT JOIN medical_orders mo ON mo.id = r.medical_order_id
				LEFT JOIN healthcare_providers order_h ON order_h.id = mo.ordered_by_hcp_id
				LEFT JOIN lab_orders lo ON lo.medical_order_id = mo.id
				LEFT JOIN ref_test_types rt ON rt.id = lo.test_type_id
				LEFT JOIN ref_specimen_types rs ON rs.id = lo.specimen_type_id
				LEFT JOIN imaging_orders io ON io.medical_order_id = mo.id
				LEFT JOIN ref_imaging_types ri ON ri.id = io.imaging_type_id
				LEFT JOIN ref_body_parts rb ON rb.id = io.body_part_id
				WHERE r.patient_id = $1
					AND r.is_active = TRUE
				ORDER BY
					r.reminder_type ASC,
					COALESCE(r.appointment_at, r.starts_at::timestamp, r.created_at) ASC
			`,
			[patientId],
		);

		const reminders = rows.map((row) => this.mapReminder(row));

		return {
			reminders,
			grouped: {
				appointments: reminders.filter(
					(reminder) => reminder.reminderType === ReminderType.APPOINTMENT,
				),
				medications: reminders.filter(
					(reminder) => reminder.reminderType === ReminderType.MEDICATION,
				),
				medicalOrders: reminders.filter(
					(reminder) => reminder.reminderType === ReminderType.MEDICAL_ORDER,
				),
			},
		};
	}

	async getReminderForPatient(patientId: string, reminderId: string) {
		const { rows } = await this.databaseService.query(
			`
				SELECT id, reminder_type
				FROM reminders
				WHERE id = $1 AND patient_id = $2
			`,
			[reminderId, patientId],
		);

		return rows[0] ?? null;
	}

	async updateReminder(
		patientId: string,
		reminderId: string,
		data: {
			reminderTime?: string;
			customDays?: number[] | null;
			hasCustomDays: boolean;
			isActive?: boolean;
		},
	) {
		const { rows } = await this.databaseService.query(
			`
				UPDATE reminders
				SET
					reminder_time = COALESCE($3::time, reminder_time),
					custom_days = CASE
						WHEN $4::boolean THEN $5::int[]
						ELSE custom_days
					END,
					is_active = COALESCE($6::boolean, is_active),
					dismissed_at = CASE
						WHEN $6::boolean = FALSE THEN NOW()
						ELSE dismissed_at
					END,
					updated_at = NOW()
				WHERE id = $1
					AND patient_id = $2
				RETURNING
					id AS reminder_id,
					reminder_type,
					medication_id,
					medical_order_id,
					encounter_id,
					starts_at,
					ends_at,
					appointment_at,
					reminder_time,
					custom_days,
					is_active,
					dismissed_at,
					created_at,
					updated_at
			`,
			[
				reminderId,
				patientId,
				data.reminderTime ?? null,
				data.hasCustomDays,
				data.customDays ?? null,
				data.isActive ?? null,
			],
		);

		if (rows.length === 0) {
			throw new NotFoundException('Reminder not found.');
		}

		return { reminder: this.mapReminder(rows[0]) };
	}

	async listNotifications(patientUserId: string) {
		const { rows } = await this.databaseService.query(
			`
				SELECT
					id AS notification_id,
					notification_type,
					status,
					title,
					message,
					reminder_id,
					scheduled_for,
					sent_at,
					read_at,
					created_at
				FROM notifications
				WHERE user_id = $1
				ORDER BY created_at DESC, scheduled_for DESC
			`,
			[patientUserId],
		);

		return { notifications: rows.map((row) => this.mapNotification(row)) };
	}

	async consumePendingNotifications(patientUserId: string) {
		const { rows } = await this.databaseService.query(
			`
				WITH due_notifications AS (
					SELECT id
					FROM notifications
					WHERE user_id = $1
						AND status = $2
						AND scheduled_for <= NOW()
					ORDER BY scheduled_for ASC, created_at ASC
					FOR UPDATE SKIP LOCKED
				)
				UPDATE notifications n
				SET status = $3, sent_at = NOW()
				FROM due_notifications d
				WHERE n.id = d.id
				RETURNING
					n.id AS notification_id,
					n.notification_type,
					n.status,
					n.title,
					n.message,
					n.reminder_id,
					n.scheduled_for,
					n.sent_at,
					n.read_at,
					n.created_at
			`,
			[patientUserId, NotificationStatus.PENDING, NotificationStatus.SENT],
		);

		return { notifications: rows.map((row) => this.mapNotification(row)) };
	}

	async markNotificationRead(patientUserId: string, notificationId: string) {
		const { rows } = await this.databaseService.query(
			`
				UPDATE notifications
				SET status = $3, read_at = NOW()
				WHERE id = $1
					AND user_id = $2
				RETURNING
					id AS notification_id,
					notification_type,
					status,
					title,
					message,
					reminder_id,
					scheduled_for,
					sent_at,
					read_at,
					created_at
			`,
			[notificationId, patientUserId, NotificationStatus.READ],
		);

		if (rows.length === 0) {
			throw new NotFoundException('Notification not found.');
		}

		return { notification: this.mapNotification(rows[0]) };
	}

	async listActiveDiagnosesForJournal(
		patientId: string,
	): Promise<ActiveDiagnosisJournalOption[]> {
		const { rows } = await this.databaseService.query(
			`
				SELECT
					d.id AS diagnosis_id,
					d.icd11_code,
					d.icd11_title,
					d.clinical_description,
					d.is_chronic,
					TRIM(CONCAT_WS(' ', h.first_name, h.middle_name, h.surname)) AS diagnosed_by,
					d.diagnosed_date
				FROM diagnoses d
				LEFT JOIN clinical_encounters ce ON ce.id = d.encounter_id
				LEFT JOIN healthcare_providers h ON h.id = ce.hcp_id
				WHERE d.patient_id = $1
					AND (d.status = $2 OR d.status IS NULL)
				ORDER BY d.is_chronic DESC, d.diagnosed_date DESC NULLS LAST, d.created_at DESC
			`,
			[patientId, DiagnosisStatus.ACTIVE],
		);

		return rows.map((row) => ({
			diagnosisId: row.diagnosis_id,
			icd11Code: row.icd11_code,
			icd11Title: row.icd11_title,
			clinicalDescription: row.clinical_description,
			isChronic: row.is_chronic,
			diagnosedBy: row.diagnosed_by,
			diagnosedDate: row.diagnosed_date,
		}));
	}

	async createHealthJournalEntry(
		patientId: string,
		dto: CreateHealthJournalEntryDto,
	): Promise<CreatedHealthJournalEntry> {
		const client = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const diagnosis = await this.getActiveDiagnosisById(
				client,
				patientId,
				dto.diagnosisId,
			);

			if (!diagnosis) {
				throw new NotFoundException(
					'The selected diagnosis is not active for this patient.',
				);
			}

			const { rows } = await client.query(
				`
					INSERT INTO patient_health_notes
						(
							patient_id,
							diagnosis_id,
							patient_outcome,
							patient_outcome_details,
							mood,
							pain_level,
							energy_level
						)
					VALUES ($1, $2, $3, $4, $5, $6, $7)
					RETURNING
						id,
						patient_id,
						diagnosis_id,
						note_date,
						patient_outcome,
						patient_outcome_details,
						mood,
						pain_level,
						energy_level,
						created_at,
						updated_at
				`,
				[
					patientId,
					dto.diagnosisId,
					dto.patientOutcome,
					dto.patientOutcomeDetails ?? null,
					dto.mood,
					dto.painLevel,
					dto.energyLevel,
				],
			);

			await client.query('COMMIT');

			const note = rows[0];

			return {
				noteId: note.id,
				patientId: note.patient_id,
				diagnosisId: note.diagnosis_id,
				noteDate: note.note_date,
				patientOutcome: note.patient_outcome,
				patientOutcomeDetails: note.patient_outcome_details,
				mood: note.mood,
				painLevel: note.pain_level !== null ? Number(note.pain_level) : null,
				energyLevel:
					note.energy_level !== null ? Number(note.energy_level) : null,
				createdAt: note.created_at,
				updatedAt: note.updated_at,
				diagnosis,
			};
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	async getHealthJournalSnapshotContext(
		patientId: string,
		diagnosisId: string,
		currentNoteId: string,
	): Promise<PatientHealthJournalSnapshotContext> {
		const medicalIdentity = await loadPatientMedicalIdentity(
			this.databaseService,
			patientId,
		);

		const [
			selectedDiagnosisResult,
			activeOrdersResult,
			recentEncountersResult,
			previousNotesResult,
		] = await Promise.all([
			this.databaseService.query(
				`
					SELECT
						id AS diagnosis_id,
						icd11_code,
						icd11_title,
						clinical_description,
						is_chronic,
						COALESCE(status, $3) AS status,
						diagnosed_date
					FROM diagnoses
					WHERE id = $1
						AND patient_id = $2
				`,
				[diagnosisId, patientId, DiagnosisStatus.ACTIVE],
			),
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
				[patientId, OrderStatus.PENDING, OrderStatus.IN_PROGRESS],
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
						COALESCE(encounter_diagnoses.diagnoses, '[]'::json) AS diagnoses
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
					WHERE ce.patient_id = $1
					ORDER BY ce.encounter_date DESC NULLS LAST, ce.created_at DESC
					LIMIT 5
				`,
				[patientId, DiagnosisStatus.ACTIVE],
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
						AND n.id <> $2
					ORDER BY n.note_date DESC, n.created_at DESC
				`,
				[patientId, currentNoteId],
			),
		]);

		const selectedDiagnosis = selectedDiagnosisResult.rows[0];
		if (!selectedDiagnosis) {
			throw new NotFoundException('Diagnosis not found for this patient.');
		}

		return {
			medicalIdentity,
			selectedDiagnosis: {
				diagnosisId: selectedDiagnosis.diagnosis_id,
				icd11Code: selectedDiagnosis.icd11_code,
				icd11Title: selectedDiagnosis.icd11_title,
				clinicalDescription: selectedDiagnosis.clinical_description,
				isChronic: selectedDiagnosis.is_chronic,
				status: selectedDiagnosis.status,
				diagnosedDate: selectedDiagnosis.diagnosed_date,
			},
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
			})),
			previousHealthNotes: previousNotesResult.rows.map((row) => ({
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
		};
	}

	private mapReminder(row: any) {
		const base = {
			reminderId: row.reminder_id,
			reminderType: row.reminder_type,
			startsAt: row.starts_at,
			endsAt: row.ends_at,
			appointmentAt: row.appointment_at,
			reminderTime: row.reminder_time,
			customDays: row.custom_days,
			isActive: row.is_active,
			dismissedAt: row.dismissed_at,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};

		if (row.reminder_type === ReminderType.MEDICATION) {
			return {
				...base,
				medication: {
					medicationId: row.medication_id,
					name: row.medication_name,
					dosageAmount:
						row.dosage_amount !== undefined && row.dosage_amount !== null
							? Number(row.dosage_amount)
							: null,
					dosageUnit: row.dosage_unit,
					form: row.form,
					frequency: row.frequency,
					startDate: row.start_date,
					endDate: row.end_date,
					prescribedBy: row.medication_prescribed_by,
				},
			};
		}

		if (row.reminder_type === ReminderType.APPOINTMENT) {
			return {
				...base,
				appointment: {
					encounterId: row.encounter_id,
					doctorName: row.appointment_doctor_name,
					location: row.location_address,
					notes: row.appointment_notes,
				},
			};
		}

		return {
			...base,
			medicalOrder: {
				medicalOrderId: row.medical_order_id,
				orderType: row.order_type,
				orderName: row.order_name,
				priority: row.order_priority,
				status: row.order_status,
				orderedAt: row.ordered_at,
				orderedBy: row.order_doctor_name,
				specimenType: row.specimen_type,
				bodyPart: row.body_part,
			},
		};
	}

	private mapNotification(row: any) {
		return {
			notificationId: row.notification_id,
			notificationType: row.notification_type,
			status: row.status,
			title: row.title,
			message: row.message,
			reminderId: row.reminder_id,
			scheduledFor: row.scheduled_for,
			sentAt: row.sent_at,
			readAt: row.read_at,
			createdAt: row.created_at,
		};
	}

	private mapMedicalHistorySummary(
		row: any,
	): PatientMedicalHistoryEncounterSummary {
		return {
			encounterId: row.encounter_id,
			doctorName: row.doctor_name,
			doctorSpeciality: row.doctor_speciality,
			encounterDate: row.encounter_date,
			location: row.location_address,
			primaryDiagnosis:
				row.icd11_code || row.icd11_title
					? {
							icd11Code: row.icd11_code,
							icd11Title: row.icd11_title,
						}
					: null,
		};
	}

	private formatDateOnly(value: string | Date | null): string | null {
		if (!value) {
			return null;
		}

		if (typeof value === 'string') {
			return value.slice(0, 10);
		}

		const year = value.getFullYear();
		const month = `${value.getMonth() + 1}`.padStart(2, '0');
		const day = `${value.getDate()}`.padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	private async getActiveDiagnosisById(
		client: PoolClient,
		patientId: string,
		diagnosisId: string,
	): Promise<ActiveDiagnosisJournalOption | null> {
		const { rows } = await client.query(
			`
				SELECT
					d.id AS diagnosis_id,
					d.icd11_code,
					d.icd11_title,
					d.clinical_description,
					d.is_chronic,
					TRIM(CONCAT_WS(' ', h.first_name, h.middle_name, h.surname)) AS diagnosed_by,
					d.diagnosed_date
				FROM diagnoses d
				LEFT JOIN clinical_encounters ce ON ce.id = d.encounter_id
				LEFT JOIN healthcare_providers h ON h.id = ce.hcp_id
				WHERE d.id = $1
					AND d.patient_id = $2
					AND (d.status = $3 OR d.status IS NULL)
			`,
			[diagnosisId, patientId, DiagnosisStatus.ACTIVE],
		);

		const diagnosis = rows[0];
		if (!diagnosis) {
			return null;
		}

		return {
			diagnosisId: diagnosis.diagnosis_id,
			icd11Code: diagnosis.icd11_code,
			icd11Title: diagnosis.icd11_title,
			clinicalDescription: diagnosis.clinical_description,
			isChronic: diagnosis.is_chronic,
			diagnosedBy: diagnosis.diagnosed_by,
			diagnosedDate: diagnosis.diagnosed_date,
		};
	}

	async listHealthJournalDiagnosesSummary(patientId: string) {
		const { rows } = await this.databaseService.query(
			`
				SELECT
					d.id AS diagnosis_id,
					d.icd11_code,
					d.icd11_title,
					d.is_chronic,
					COUNT(n.id)::INT AS total_entries,
					MAX(n.note_date) AS last_entry_date,
					last_note.patient_outcome AS last_patient_outcome,
					last_note.pain_level AS last_pain_level,
					last_note.energy_level AS last_energy_level,
					last_note.mood AS last_mood,
					last_note.created_at AS last_note_created_at
				FROM diagnoses d
				INNER JOIN patient_health_notes n ON n.diagnosis_id = d.id
				LEFT JOIN LATERAL (
					SELECT
						patient_outcome,
						pain_level,
						energy_level,
						mood,
						created_at
					FROM patient_health_notes
					WHERE diagnosis_id = d.id
						AND patient_id = $1
					ORDER BY note_date DESC, created_at DESC
					LIMIT 1
				) last_note ON TRUE
				WHERE d.patient_id = $1
				GROUP BY
					d.id,
					d.icd11_code,
					d.icd11_title,
					d.is_chronic,
					last_note.patient_outcome,
					last_note.pain_level,
					last_note.energy_level,
					last_note.mood,
					last_note.created_at
				ORDER BY last_entry_date DESC NULLS LAST
			`,
			[patientId],
		);

		return {
			diagnoses: rows.map((row) => ({
				diagnosisId: row.diagnosis_id,
				icd11Code: row.icd11_code,
				icd11Title: row.icd11_title,
				isChronic: row.is_chronic,
				totalEntries: row.total_entries,
				lastEntryDate: row.last_entry_date,
				lastEntry: {
					patientOutcome: row.last_patient_outcome,
					painLevel:
						row.last_pain_level !== null ? Number(row.last_pain_level) : null,
					energyLevel:
						row.last_energy_level !== null
							? Number(row.last_energy_level)
							: null,
					mood: row.last_mood,
					createdAt: row.last_note_created_at,
				},
			})),
		};
	}

	async listHealthJournalNotes(patientId: string, diagnosisId: string) {
		const { rows: diagnosisRows } = await this.databaseService.query(
			`
				SELECT id, icd11_code, icd11_title, is_chronic, status
				FROM diagnoses
				WHERE id = $1 AND patient_id = $2
			`,
			[diagnosisId, patientId],
		);

		if (diagnosisRows.length === 0) {
			throw new NotFoundException('Diagnosis not found for this patient.');
		}

		const diagnosis = diagnosisRows[0];

		const { rows } = await this.databaseService.query(
			`
				SELECT
					id AS note_id,
					note_date,
					patient_outcome,
					patient_outcome_details,
					mood,
					pain_level,
					energy_level,
					created_at
				FROM patient_health_notes
				WHERE patient_id = $1
					AND diagnosis_id = $2
				ORDER BY note_date DESC, created_at DESC
			`,
			[patientId, diagnosisId],
		);

		return {
			diagnosis: {
				diagnosisId: diagnosis.id,
				icd11Code: diagnosis.icd11_code,
				icd11Title: diagnosis.icd11_title,
				isChronic: diagnosis.is_chronic,
				status: diagnosis.status,
			},
			notes: rows.map((row) => ({
				noteId: row.note_id,
				noteDate: row.note_date,
				patientOutcome: row.patient_outcome,
				patientOutcomeDetails: row.patient_outcome_details,
				mood: row.mood,
				painLevel: row.pain_level !== null ? Number(row.pain_level) : null,
				energyLevel:
					row.energy_level !== null ? Number(row.energy_level) : null,
				createdAt: row.created_at,
			})),
		};
	}

	async saveProfilePicture(
		userId: string,
		file: Express.Multer.File,
	): Promise<void> {
		await this.databaseService.query(
			`
				INSERT INTO documents
					(user_id, file_type, file_path, file_name, mime_type, file_size_bytes, uploaded_at)
				VALUES ($1, 'PROFILE_PICTURE', $2, $3, $4, $5, now())
			`,
			[userId, file.path, file.filename, file.mimetype, file.size],
		);
	}

	async getLatestProfilePicture(userId: string): Promise<{
		filePath: string;
		fileName: string;
		mimeType: string;
	} | null> {
		const { rows } = await this.databaseService.query(
			`
				SELECT file_path, file_name, mime_type
				FROM documents
				WHERE user_id = $1
					AND file_type = 'PROFILE_PICTURE'
				ORDER BY uploaded_at DESC NULLS LAST, id DESC
				LIMIT 1
			`,
			[userId],
		);

		if (rows.length === 0) return null;

		return {
			filePath: rows[0].file_path,
			fileName: rows[0].file_name,
			mimeType: rows[0].mime_type,
		};
	}

	async addEmergencyContact(patientId: string, dto: AddEmergencyContactDto) {
		const client = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			if (dto.isPrimary) {
				await client.query(
					`
						UPDATE patient_emergency_contacts
						SET is_primary = FALSE
						WHERE patient_id = $1 AND is_primary = TRUE
					`,
					[patientId],
				);
			}

			const { rows } = await client.query(
				`
					INSERT INTO patient_emergency_contacts
						(patient_id, contact_name, phone_number, relationship, is_primary)
					VALUES ($1, $2, $3, $4, $5)
					RETURNING
						id AS contact_id,
						contact_name,
						phone_number,
						relationship,
						is_primary,
						created_at
				`,
				[
					patientId,
					dto.contactName,
					dto.phoneNumber,
					dto.relationship,
					dto.isPrimary ?? false,
				],
			);

			await client.query('COMMIT');
			return rows[0];
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	async removeEmergencyContact(
		patientId: string,
		contactId: string,
	): Promise<void> {
		const { rowCount } = await this.databaseService.query(
			`
				DELETE FROM patient_emergency_contacts
				WHERE id = $1 AND patient_id = $2
			`,
			[contactId, patientId],
		);

		if (rowCount === 0) {
			throw new NotFoundException('Emergency contact not found.');
		}
	}
}
