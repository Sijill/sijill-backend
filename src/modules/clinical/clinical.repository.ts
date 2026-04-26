import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '@db/database.service';
import {
	AccessStatus,
	AccessType,
	DiagnosisStatus,
	NotificationStatus,
	NotificationType,
	OrderStatus,
	OrderType,
	UserRole,
} from '@common/enums/db.enum';
import { PinoLogger } from 'nestjs-pino';
import { PoolClient } from 'pg';
import {
	CreateEncounterDto,
	ImagingOrderInputDto,
	LabOrderInputDto,
	MedicationInputDto,
} from './dto/create-encounter.dto';
import type { ClinicalSessionContext } from './types/clinical-session.type';
import { loadPatientMedicalIdentity } from '@modules/patient/patient-medical-identity.query';

@Injectable()
export class ClinicalRepository {
	constructor(
		private readonly databaseService: DatabaseService,
		private readonly logger: PinoLogger,
	) {
		this.logger.setContext(ClinicalRepository.name);
	}

	async getPatientByUserId(userId: string) {
		const { rows } = await this.databaseService.query(
			`
				SELECT
					id,
					user_id,
					TRIM(CONCAT_WS(' ', first_name, middle_name, surname)) AS full_name,
					gender,
					date_of_birth
				FROM patients
				WHERE user_id = $1
			`,
			[userId],
		);

		return rows[0] ?? null;
	}

	async getHealthcareProviderByUserId(userId: string) {
		const { rows } = await this.databaseService.query(
			`
				SELECT
					id,
					user_id,
					specialization,
					TRIM(CONCAT_WS(' ', first_name, middle_name, surname)) AS full_name
				FROM healthcare_providers
				WHERE user_id = $1
			`,
			[userId],
		);

		return rows[0] ?? null;
	}

	async createPermissionToken(data: {
		patientId: string;
		codeHash: string;
		entityType:
			| UserRole.HEALTHCARE_PROVIDER
			| UserRole.LAB
			| UserRole.IMAGING_CENTER;
		accessType: AccessType;
		expiresAt: Date;
	}) {
		return await this.databaseService.query(
			`
				INSERT INTO patient_permission_tokens
					(patient_id, code_hash, entity_type, access_type, expires_at)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING id, entity_type, access_type, expires_at
			`,
			[
				data.patientId,
				data.codeHash,
				data.entityType,
				data.accessType,
				data.expiresAt,
			],
		);
	}

	async listActivePermissionTokens(patientId: string) {
		const { rows } = await this.databaseService.query(
			`
				WITH expired_tokens AS (
					UPDATE patient_permission_tokens
					SET status = $2
					WHERE patient_id = $1
						AND status = $3
						AND revoked_at IS NULL
						AND expires_at <= NOW()
				)
				SELECT
					ppt.id AS token_id,
					ppt.entity_type,
					ppt.access_type,
					ppt.expires_at,
					ppt.created_at,
					EXISTS (
						SELECT 1
						FROM patient_access_grants pag
						WHERE pag.permission_token_id = ppt.id
					) AS was_used
				FROM patient_permission_tokens ppt
				WHERE ppt.patient_id = $1
					AND ppt.status = $3
					AND ppt.revoked_at IS NULL
					AND ppt.expires_at > NOW()
				ORDER BY ppt.created_at DESC
			`,
			[patientId, AccessStatus.EXPIRED, AccessStatus.ACTIVE],
		);

		return rows;
	}

	async getPermissionTokenById(tokenId: string) {
		const client = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			await client.query(
				`
					UPDATE patient_permission_tokens
					SET status = $2
					WHERE id = $1
						AND status = $3
						AND expires_at < NOW()
				`,
				[tokenId, AccessStatus.EXPIRED, AccessStatus.ACTIVE],
			);

			const { rows } = await client.query(
				`
					SELECT
						id,
						patient_id,
						status,
						entity_type,
						access_type,
						expires_at,
						revoked_at
					FROM patient_permission_tokens
					WHERE id = $1
				`,
				[tokenId],
			);

			await client.query('COMMIT');
			return rows[0] ?? null;
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	async revokePermissionToken(tokenId: string) {
		const client = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const revokeTokenResult = await client.query(
				`
					UPDATE patient_permission_tokens
					SET status = $2, revoked_at = NOW()
					WHERE id = $1
					RETURNING id, revoked_at
				`,
				[tokenId, AccessStatus.REVOKED],
			);

			await client.query(
				`
					UPDATE patient_access_grants
					SET revoked_at = NOW()
					WHERE permission_token_id = $1
						AND revoked_at IS NULL
				`,
				[tokenId],
			);

			await client.query('COMMIT');
			return revokeTokenResult.rows[0];
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	async redeemPermissionToken(codeHash: string, hcpUserId: string) {
		const client = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const tokenResult = await client.query(
				`
					SELECT
						ppt.id,
						ppt.patient_id,
						ppt.entity_type,
						ppt.access_type,
						ppt.status,
						ppt.expires_at,
						p.user_id AS patient_user_id,
						TRIM(CONCAT_WS(' ', p.first_name, p.middle_name, p.surname)) AS patient_full_name,
						p.gender,
						EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INT AS age
					FROM patient_permission_tokens ppt
					INNER JOIN patients p ON p.id = ppt.patient_id
					WHERE ppt.code_hash = $1
					FOR UPDATE
				`,
				[codeHash],
			);

			if (tokenResult.rows.length === 0) {
				throw new NotFoundException(
					'No active token found matching this code.',
				);
			}

			const token = tokenResult.rows[0];

			if (token.entity_type !== UserRole.HEALTHCARE_PROVIDER) {
				throw new ForbiddenException(
					'This permission token is not valid for healthcare providers.',
				);
			}

			if (
				token.status === AccessStatus.ACTIVE &&
				new Date(token.expires_at) <= new Date()
			) {
				await client.query(
					`
						UPDATE patient_permission_tokens
						SET status = $2
						WHERE id = $1
					`,
					[token.id, AccessStatus.EXPIRED],
				);
				token.status = AccessStatus.EXPIRED;
			}

			if (token.status === AccessStatus.REVOKED) {
				throw new ForbiddenException('Permission token has been revoked.');
			}

			if (token.status === AccessStatus.EXPIRED) {
				throw new ForbiddenException('Permission token has expired.');
			}

			const hcpResult = await client.query(
				`
					SELECT id
					FROM healthcare_providers
					WHERE user_id = $1
				`,
				[hcpUserId],
			);

			if (hcpResult.rows.length === 0) {
				throw new NotFoundException('Healthcare provider profile not found.');
			}

			const grantResult = await client.query(
				`
					INSERT INTO patient_access_grants
						(permission_token_id, grantee_user_id)
					VALUES ($1, $2)
					ON CONFLICT (permission_token_id, grantee_user_id)
					DO UPDATE SET revoked_at = NULL
					RETURNING id
				`,
				[token.id, hcpUserId],
			);

			await client.query('COMMIT');

			return {
				sessionId: grantResult.rows[0].id,
				permissionTokenId: token.id,
				patientId: token.patient_id,
				patientUserId: token.patient_user_id,
				accessType: token.access_type as AccessType,
				expiresAt: token.expires_at,
				hcpId: hcpResult.rows[0].id,
				patient: {
					patientId: token.patient_id,
					fullName: token.patient_full_name,
					gender: token.gender,
					age: Number(token.age),
				},
			};
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	async validateClinicalSession(
		sessionId: string,
		hcpUserId: string,
	): Promise<ClinicalSessionContext> {
		const { rows } = await this.databaseService.query(
			`
				SELECT
					pag.id AS session_id,
					pag.permission_token_id,
					pag.revoked_at AS grant_revoked_at,
					ppt.patient_id,
					ppt.access_type,
					ppt.status,
					ppt.expires_at,
					ppt.revoked_at AS token_revoked_at,
					p.user_id AS patient_user_id,
					h.id AS hcp_id
				FROM patient_access_grants pag
				INNER JOIN patient_permission_tokens ppt
					ON ppt.id = pag.permission_token_id
				INNER JOIN patients p
					ON p.id = ppt.patient_id
				INNER JOIN healthcare_providers h
					ON h.user_id = $2
				WHERE pag.id = $1
					AND pag.grantee_user_id = $2
			`,
			[sessionId, hcpUserId],
		);

		const session = rows[0];
		if (!session) {
			throw new NotFoundException('Clinical session not found.');
		}

		if (session.grant_revoked_at || session.token_revoked_at) {
			throw new ForbiddenException('Clinical session has been revoked.');
		}

		if (session.status === AccessStatus.REVOKED) {
			throw new ForbiddenException('Clinical session has been revoked.');
		}

		if (new Date(session.expires_at) <= new Date()) {
			await this.databaseService.query(
				`
					UPDATE patient_permission_tokens
					SET status = $2
					WHERE id = $1 AND status = $3
				`,
				[
					session.permission_token_id,
					AccessStatus.EXPIRED,
					AccessStatus.ACTIVE,
				],
			);

			throw new ForbiddenException('Clinical session has expired.');
		}

		return {
			sessionId: session.session_id,
			permissionTokenId: session.permission_token_id,
			patientId: session.patient_id,
			patientUserId: session.patient_user_id,
			hcpId: session.hcp_id,
			hcpUserId,
			accessType: session.access_type as AccessType,
			expiresAt: new Date(session.expires_at).toISOString(),
		};
	}

	async getMedicalIdentity(patientId: string) {
		const identity = await loadPatientMedicalIdentity(
			this.databaseService,
			patientId,
		);

		return {
			basicInfo: {
				fullName: identity.basicInfo.fullName,
				gender: identity.basicInfo.gender,
				age: identity.basicInfo.age,
				bloodType: identity.basicInfo.bloodType,
				weightKg: identity.basicInfo.weightKg,
				heightCm: identity.basicInfo.heightCm,
				profilePictureUrl: identity.basicInfo.profilePictureUrl,
			},
			activeDiagnoses: identity.activeDiagnoses,
			currentMedications: identity.currentMedications,
			allergies: identity.allergies.map((row) => ({
				allergyId: row.allergyId,
				allergenName: row.allergenName,
				severity: row.severity,
				reactionDescription: row.reactionDescription,
				verifiedBy: row.diagnosedBy,
				verifiedDate: row.diagnosedDate,
			})),
			chronicConditions: identity.chronicConditions,
			emergencyContacts: identity.emergencyContacts,
		};
	}

	async getPatientVitals(patientId: string) {
		const { rows } = await this.databaseService.query(
			`
				SELECT blood_type, weight_kg, height_cm
				FROM patients
				WHERE id = $1
			`,
			[patientId],
		);

		return rows[0] ?? null;
	}

	async updatePatientVitals(
		patientId: string,
		updates: Partial<{
			bloodType: string;
			weightKg: number;
			heightCm: number;
		}>,
	) {
		const setClauses: string[] = [];
		const params: Array<string | number> = [patientId];

		if (updates.bloodType !== undefined) {
			params.push(updates.bloodType);
			setClauses.push(`blood_type = $${params.length}`);
		}

		if (updates.weightKg !== undefined) {
			params.push(updates.weightKg);
			setClauses.push(`weight_kg = $${params.length}`);
		}

		if (updates.heightCm !== undefined) {
			params.push(updates.heightCm);
			setClauses.push(`height_cm = $${params.length}`);
		}

		setClauses.push('updated_at = NOW()');

		const { rows } = await this.databaseService.query(
			`
				UPDATE patients
				SET ${setClauses.join(', ')}
				WHERE id = $1
				RETURNING blood_type, weight_kg, height_cm
			`,
			params,
		);

		return rows[0];
	}

	async getMedicalHistory(patientId: string, page: number, limit: number) {
		const offset = (page - 1) * limit;

		const [countResult, dataResult] = await Promise.all([
			this.databaseService.query(
				`
					SELECT COUNT(*)::INT AS total
					FROM clinical_encounters
					WHERE patient_id = $1
				`,
				[patientId],
			),
			this.databaseService.query(
				`
					SELECT
						ce.id AS encounter_id,
						TRIM(CONCAT_WS(' ', h.first_name, h.middle_name, h.surname)) AS hcp_full_name,
						h.specialization AS hcp_specialization,
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
					LIMIT $2 OFFSET $3
				`,
				[patientId, limit, offset],
			),
		]);

		return {
			total: countResult.rows[0]?.total ?? 0,
			data: dataResult.rows.map((row) => ({
				encounterId: row.encounter_id,
				hcpFullName: row.hcp_full_name,
				hcpSpecialization: row.hcp_specialization,
				encounterDate: row.encounter_date,
				locationAddress: row.location_address,
				primaryDiagnosis:
					row.icd11_code || row.icd11_title
						? {
								icd11Code: row.icd11_code,
								icd11Title: row.icd11_title,
							}
						: null,
			})),
		};
	}

	async getEncounterMeta(encounterId: string) {
		const { rows } = await this.databaseService.query(
			`
				SELECT
					ce.id AS encounter_id,
					ce.patient_id,
					TRIM(CONCAT_WS(' ', h.first_name, h.middle_name, h.surname)) AS hcp_full_name,
					h.specialization AS hcp_specialization,
					ce.encounter_date,
					ce.location_address,
					ce.next_appointment_date,
					ce.appointment_notes
				FROM clinical_encounters ce
				LEFT JOIN healthcare_providers h ON h.id = ce.hcp_id
				WHERE ce.id = $1
			`,
			[encounterId],
		);

		return rows[0] ?? null;
	}

	async getEncounterDetail(encounterId: string) {
		const [
			symptomsResult,
			diagnosesResult,
			medicationsResult,
			labOrdersResult,
			imagingOrdersResult,
		] = await Promise.all([
			this.databaseService.query(
				`
						SELECT
							id AS symptom_id,
							title,
							description
						FROM encounter_symptoms_complaints
						WHERE encounter_id = $1
						ORDER BY created_at ASC
					`,
				[encounterId],
			),
			this.databaseService.query(
				`
						SELECT
							id AS diagnosis_id,
							icd11_code,
							icd11_title,
							clinical_description,
							is_chronic,
							status
						FROM diagnoses
						WHERE encounter_id = $1
						ORDER BY created_at ASC
					`,
				[encounterId],
			),
			this.databaseService.query(
				`
						SELECT
							m.id AS medication_id,
							m.medication_name,
							m.dosage_amount,
							m.dosage_unit,
							m.form,
							m.frequency,
							m.start_date,
							m.end_date,
							TRIM(CONCAT_WS(' ', h.first_name, h.middle_name, h.surname)) AS prescribed_by,
							m.prescribed_at
						FROM medications m
						LEFT JOIN healthcare_providers h ON h.id = m.prescribed_by_hcp_id
						WHERE m.encounter_id = $1
						ORDER BY m.created_at ASC
					`,
				[encounterId],
			),
			this.databaseService.query(
				`
						SELECT
							mo.id AS order_id,
							mo.order_type,
							mo.order_status,
							mo.ordered_at,
							rt.name AS test_type,
							rs.name AS specimen_type,
							lo.priority,
							lo.fasting_required,
							lo.clinical_indication,
							lr.id AS result_id,
							lr.result_data,
							lr.additional_notes,
							lr.uploaded_at
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
						WHERE mo.encounter_id = $1
							AND mo.order_type = $2
						ORDER BY mo.ordered_at ASC NULLS LAST, mo.created_at ASC
					`,
				[encounterId, OrderType.LABORATORY],
			),
			this.databaseService.query(
				`
						SELECT
							mo.id AS order_id,
							mo.order_type,
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
							ir.uploaded_at
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
						WHERE mo.encounter_id = $1
							AND mo.order_type = $2
						ORDER BY mo.ordered_at ASC NULLS LAST, mo.created_at ASC
					`,
				[encounterId, OrderType.IMAGING],
			),
		]);

		const labResultIds = labOrdersResult.rows
			.map((row) => row.result_id)
			.filter(Boolean);
		const imagingResultIds = imagingOrdersResult.rows
			.map((row) => row.result_id)
			.filter(Boolean);

		const [labDocumentsResult, imagingDocumentsResult] = await Promise.all([
			labResultIds.length > 0
				? this.databaseService.query(
						`
							SELECT
								lrd.lab_result_id,
								d.id AS document_id,
								d.file_name,
								d.mime_type,
								d.file_size_bytes,
								d.file_path
							FROM lab_result_documents lrd
							INNER JOIN documents d ON d.id = lrd.document_id
							WHERE lrd.lab_result_id = ANY($1::uuid[])
						`,
						[labResultIds],
					)
				: Promise.resolve({ rows: [] }),
			imagingResultIds.length > 0
				? this.databaseService.query(
						`
							SELECT
								ird.imaging_result_id,
								d.id AS document_id,
								d.file_name,
								d.mime_type,
								d.file_size_bytes,
								d.file_path
							FROM imaging_result_documents ird
							INNER JOIN documents d ON d.id = ird.document_id
							WHERE ird.imaging_result_id = ANY($1::uuid[])
						`,
						[imagingResultIds],
					)
				: Promise.resolve({ rows: [] }),
		]);

		const labDocumentsByResultId = new Map<string, any[]>();
		for (const row of labDocumentsResult.rows) {
			const docs = labDocumentsByResultId.get(row.lab_result_id) ?? [];
			docs.push(this.mapDocumentReference(row));
			labDocumentsByResultId.set(row.lab_result_id, docs);
		}

		const imagingDocumentsByResultId = new Map<string, any[]>();
		for (const row of imagingDocumentsResult.rows) {
			const docs = imagingDocumentsByResultId.get(row.imaging_result_id) ?? [];
			docs.push(this.mapDocumentReference(row));
			imagingDocumentsByResultId.set(row.imaging_result_id, docs);
		}

		const orders = [
			...labOrdersResult.rows.map((row) => ({
				orderId: row.order_id,
				orderType: row.order_type,
				orderStatus: row.order_status,
				orderedAt: row.ordered_at,
				labOrder: {
					testType: row.test_type,
					specimenType: row.specimen_type,
					priority: row.priority,
					fastingRequired: row.fasting_required,
					clinicalIndication: row.clinical_indication,
					result: row.result_id
						? {
								resultData: row.result_data,
								additionalNotes: row.additional_notes,
								uploadedAt: row.uploaded_at,
								documents: labDocumentsByResultId.get(row.result_id) ?? [],
							}
						: null,
				},
				imagingOrder: null,
			})),
			...imagingOrdersResult.rows.map((row) => ({
				orderId: row.order_id,
				orderType: row.order_type,
				orderStatus: row.order_status,
				orderedAt: row.ordered_at,
				labOrder: null,
				imagingOrder: {
					imagingType: row.imaging_type,
					bodyPart: row.body_part,
					priority: row.priority,
					contrastUsed: row.contrast_used,
					clinicalIndication: row.clinical_indication,
					result: row.result_id
						? {
								studyDescription: row.study_description,
								findings: row.findings,
								uploadedAt: row.uploaded_at,
								documents: imagingDocumentsByResultId.get(row.result_id) ?? [],
							}
						: null,
				},
			})),
		].sort((a, b) => {
			const first = a.orderedAt ? new Date(a.orderedAt).getTime() : 0;
			const second = b.orderedAt ? new Date(b.orderedAt).getTime() : 0;
			return first - second;
		});

		return {
			symptoms: symptomsResult.rows.map((row) => ({
				symptomId: row.symptom_id,
				title: row.title,
				description: row.description,
			})),
			diagnoses: diagnosesResult.rows.map((row) => ({
				diagnosisId: row.diagnosis_id,
				icd11Code: row.icd11_code,
				icd11Title: row.icd11_title,
				clinicalDescription: row.clinical_description,
				isChronic: row.is_chronic,
				status: row.status ?? DiagnosisStatus.ACTIVE,
			})),
			medications: medicationsResult.rows.map((row) => ({
				medicationId: row.medication_id,
				medicationName: row.medication_name,
				dosageAmount:
					row.dosage_amount !== null ? Number(row.dosage_amount) : null,
				dosageUnit: row.dosage_unit,
				form: row.form,
				frequency: row.frequency,
				startDate: row.start_date,
				endDate: row.end_date,
				prescribedBy: row.prescribed_by,
				prescribedAt: row.prescribed_at,
			})),
			orders,
		};
	}

	async createEncounter(
		session: ClinicalSessionContext,
		dto: CreateEncounterDto,
	) {
		const client = await this.databaseService.getClient();
		const now = new Date();
		let notificationsCreated = 0;

		try {
			await client.query('BEGIN');

			await this.assertValidReferenceIds(client, dto);

			const encounterResult = await client.query(
				`
					INSERT INTO clinical_encounters
						(
							patient_id,
							hcp_id,
							encounter_date,
							location_address,
							next_appointment_date,
							appointment_notes
						)
					VALUES ($1, $2, $3, $4, $5, $6)
					RETURNING id
				`,
				[
					session.patientId,
					session.hcpId,
					now,
					dto.locationAddress ?? null,
					dto.nextAppointmentDate ?? null,
					dto.appointmentNotes ?? null,
				],
			);

			const encounterId = encounterResult.rows[0].id;

			for (const symptom of dto.symptoms) {
				await client.query(
					`
						INSERT INTO encounter_symptoms_complaints
							(encounter_id, title, description)
						VALUES ($1, $2, $3)
					`,
					[encounterId, symptom.title, symptom.description ?? null],
				);
			}

			const diagnosisIds: string[] = [];
			for (const diagnosis of dto.diagnoses) {
				const diagnosisResult = await client.query(
					`
						INSERT INTO diagnoses
							(
								encounter_id,
								patient_id,
								icd11_code,
								icd11_title,
								clinical_description,
								is_chronic,
								status,
								diagnosed_date
							)
						VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
						RETURNING id
					`,
					[
						encounterId,
						session.patientId,
						diagnosis.icd11Code,
						diagnosis.icd11Title,
						diagnosis.clinicalDescription ?? null,
						diagnosis.isChronic ?? false,
						DiagnosisStatus.ACTIVE,
						now,
					],
				);

				diagnosisIds.push(diagnosisResult.rows[0].id);
			}

			for (const allergy of dto.allergies ?? []) {
				await client.query(
					`
						INSERT INTO patient_allergies
							(
								patient_id,
								allergen_name,
								severity,
								reaction_description,
								diagnosed_by,
								diagnosed_date
							)
						VALUES ($1, $2, $3, $4, $5, $6)
					`,
					[
						session.patientId,
						allergy.allergenName,
						allergy.severity,
						allergy.reactionDescription ?? null,
						session.hcpId,
						now.toISOString().slice(0, 10),
					],
				);
			}

			for (const medication of dto.medications ?? []) {
				const medicationResult = await this.insertMedication(
					client,
					encounterId,
					session,
					medication,
					diagnosisIds,
					now,
				);

				await this.insertNotification(client, {
					userId: session.patientUserId,
					notificationType: NotificationType.MEDICATION_REMINDER,
					title: `Medication reminder: ${medication.medicationName}`,
					message: `A new medication was prescribed during your recent encounter.`,
					relatedEncounterId: encounterId,
					relatedMedicationId: medicationResult.id,
					scheduledFor: medication.startDate,
				});
				notificationsCreated += 1;
			}

			for (const labOrder of dto.labOrders ?? []) {
				const orderId = await this.insertLabOrder(
					client,
					encounterId,
					session,
					labOrder,
					now,
				);

				await this.insertNotification(client, {
					userId: session.patientUserId,
					notificationType: NotificationType.MEDICAL_ORDER,
					title: 'New laboratory order',
					message: 'A laboratory test order was added to your record.',
					relatedEncounterId: encounterId,
					relatedOrderId: orderId,
					scheduledFor: now,
				});
				notificationsCreated += 1;
			}

			for (const imagingOrder of dto.imagingOrders ?? []) {
				const orderId = await this.insertImagingOrder(
					client,
					encounterId,
					session,
					imagingOrder,
					now,
				);

				await this.insertNotification(client, {
					userId: session.patientUserId,
					notificationType: NotificationType.MEDICAL_ORDER,
					title: 'New imaging order',
					message: 'An imaging order was added to your record.',
					relatedEncounterId: encounterId,
					relatedOrderId: orderId,
					scheduledFor: now,
				});
				notificationsCreated += 1;
			}

			if (dto.nextAppointmentDate) {
				await this.insertNotification(client, {
					userId: session.patientUserId,
					notificationType: NotificationType.APPOINTMENT_REMINDER,
					title: 'Upcoming appointment',
					message:
						dto.appointmentNotes ??
						'You have a follow-up appointment scheduled.',
					relatedEncounterId: encounterId,
					scheduledFor: dto.nextAppointmentDate,
				});
				notificationsCreated += 1;
			}

			await client.query('COMMIT');

			return {
				success: true,
				encounterId,
				message: 'Encounter recorded successfully',
				notificationsCreated,
			};
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	private async insertMedication(
		client: PoolClient,
		encounterId: string,
		session: ClinicalSessionContext,
		medication: MedicationInputDto,
		diagnosisIds: string[],
		now: Date,
	) {
		let diagnosisId: string | null = null;

		if (medication.diagnosisIndex !== undefined) {
			diagnosisId = diagnosisIds[medication.diagnosisIndex] ?? null;
			if (!diagnosisId) {
				throw new BadRequestException(
					`medications.diagnosisIndex ${medication.diagnosisIndex} does not reference a valid diagnosis.`,
				);
			}
		}

		const medicationResult = await client.query(
			`
				INSERT INTO medications
					(
						encounter_id,
						patient_id,
						diagnosis_id,
						prescribed_by_hcp_id,
						medication_name,
						dosage_amount,
						dosage_unit,
						form,
						frequency,
						start_date,
						end_date,
						instructions,
						prescribed_at
					)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
				RETURNING id
			`,
			[
				encounterId,
				session.patientId,
				diagnosisId,
				session.hcpId,
				medication.medicationName,
				medication.dosageAmount,
				medication.dosageUnit,
				medication.form,
				medication.frequency,
				medication.startDate,
				medication.endDate ?? null,
				medication.instructions ?? null,
				now,
			],
		);

		return medicationResult.rows[0];
	}

	private async insertLabOrder(
		client: PoolClient,
		encounterId: string,
		session: ClinicalSessionContext,
		labOrder: LabOrderInputDto,
		now: Date,
	) {
		const orderResult = await client.query(
			`
				INSERT INTO medical_orders
					(
						encounter_id,
						patient_id,
						ordered_by_hcp_id,
						order_type,
						order_status,
						ordered_at,
						updated_at
					)
				VALUES ($1, $2, $3, $4, $5, $6, NOW())
				RETURNING id
			`,
			[
				encounterId,
				session.patientId,
				session.hcpId,
				OrderType.LABORATORY,
				OrderStatus.PENDING,
				now,
			],
		);

		const orderId = orderResult.rows[0].id;

		await client.query(
			`
				INSERT INTO lab_orders
					(
						medical_order_id,
						test_type_id,
						specimen_type_id,
						fasting_required,
						priority,
						clinical_indication
					)
				VALUES ($1, $2, $3, $4, $5, $6)
			`,
			[
				orderId,
				labOrder.testTypeId,
				labOrder.specimenTypeId ?? null,
				labOrder.fastingRequired ?? false,
				labOrder.priority,
				labOrder.clinicalIndication ?? null,
			],
		);

		return orderId;
	}

	private async insertImagingOrder(
		client: PoolClient,
		encounterId: string,
		session: ClinicalSessionContext,
		imagingOrder: ImagingOrderInputDto,
		now: Date,
	) {
		const orderResult = await client.query(
			`
				INSERT INTO medical_orders
					(
						encounter_id,
						patient_id,
						ordered_by_hcp_id,
						order_type,
						order_status,
						ordered_at,
						updated_at
					)
				VALUES ($1, $2, $3, $4, $5, $6, NOW())
				RETURNING id
			`,
			[
				encounterId,
				session.patientId,
				session.hcpId,
				OrderType.IMAGING,
				OrderStatus.PENDING,
				now,
			],
		);

		const orderId = orderResult.rows[0].id;

		await client.query(
			`
				INSERT INTO imaging_orders
					(
						medical_order_id,
						imaging_type_id,
						body_part_id,
						contrast_used,
						priority,
						clinical_indication
					)
				VALUES ($1, $2, $3, $4, $5, $6)
			`,
			[
				orderId,
				imagingOrder.imagingTypeId,
				imagingOrder.bodyPartId,
				imagingOrder.contrastUsed ?? false,
				imagingOrder.priority,
				imagingOrder.clinicalIndication ?? null,
			],
		);

		return orderId;
	}

	private async insertNotification(
		client: PoolClient,
		data: {
			userId: string;
			notificationType: NotificationType;
			title: string;
			message: string;
			relatedEncounterId?: string;
			relatedMedicationId?: string;
			relatedOrderId?: string;
			scheduledFor: string | Date;
		},
	) {
		await client.query(
			`
				INSERT INTO notifications
					(
						user_id,
						notification_type,
						status,
						title,
						message,
						related_encounter_id,
						related_medication_id,
						related_order_id,
						scheduled_for
					)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			`,
			[
				data.userId,
				data.notificationType,
				NotificationStatus.PENDING,
				data.title,
				data.message,
				data.relatedEncounterId ?? null,
				data.relatedMedicationId ?? null,
				data.relatedOrderId ?? null,
				data.scheduledFor,
			],
		);
	}

	private mapDocumentReference(row: any) {
		return {
			documentId: row.document_id,
			fileName: row.file_name,
			mimeType: row.mime_type,
			fileSizeBytes: row.file_size_bytes,
			url: row.file_path,
		};
	}

	private async assertValidReferenceIds(
		client: PoolClient,
		dto: CreateEncounterDto,
	) {
		await this.assertExistingReferenceIds(
			client,
			'ref_test_types',
			(dto.labOrders ?? []).map((item) => item.testTypeId),
			'labOrders.testTypeId',
		);
		await this.assertExistingReferenceIds(
			client,
			'ref_specimen_types',
			(dto.labOrders ?? [])
				.map((item) => item.specimenTypeId)
				.filter((value): value is number => value !== undefined),
			'labOrders.specimenTypeId',
		);
		await this.assertExistingReferenceIds(
			client,
			'ref_imaging_types',
			(dto.imagingOrders ?? []).map((item) => item.imagingTypeId),
			'imagingOrders.imagingTypeId',
		);
		await this.assertExistingReferenceIds(
			client,
			'ref_body_parts',
			(dto.imagingOrders ?? []).map((item) => item.bodyPartId),
			'imagingOrders.bodyPartId',
		);
	}

	private async assertExistingReferenceIds(
		client: PoolClient,
		tableName: string,
		ids: number[],
		fieldName: string,
	) {
		const uniqueIds = [...new Set(ids)];

		if (uniqueIds.length === 0) {
			return;
		}

		const result = await client.query(
			`SELECT id FROM ${tableName} WHERE id = ANY($1::int[])`,
			[uniqueIds],
		);

		const foundIds = new Set(result.rows.map((row) => Number(row.id)));
		const missingIds = uniqueIds.filter((id) => !foundIds.has(id));

		if (missingIds.length > 0) {
			throw new BadRequestException(
				`Invalid ${fieldName} values: ${missingIds.join(', ')}`,
			);
		}
	}
}
