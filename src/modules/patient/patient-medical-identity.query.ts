import { NotFoundException } from '@nestjs/common';
import { DiagnosisStatus } from '@common/enums/db.enum';
import { DatabaseService } from '@db/database.service';

export interface PatientMedicalIdentitySnapshot {
	basicInfo: {
		fullName: string;
		gender: string;
		age: number;
		bloodType: string | null;
		weightKg: number | null;
		heightCm: number | null;
		bmi: number | null;
		profilePictureUrl: string | null;
	};
	activeDiagnoses: Array<{
		diagnosisId: string;
		icd11Code: string | null;
		icd11Title: string | null;
		diagnosedBy: string | null;
		diagnosedDate: Date | null;
	}>;
	currentMedications: Array<{
		medicationId: string;
		medicationName: string | null;
		dosageAmount: number | null;
		dosageUnit: string | null;
		form: string | null;
		frequency: string | null;
		startDate: string | null;
		endDate: string | null;
		prescribedBy: string | null;
		prescribedAt: Date | null;
	}>;
	allergies: Array<{
		allergyId: string;
		allergenName: string | null;
		severity: string | null;
		reactionDescription: string | null;
		diagnosedBy: string | null;
		diagnosedDate: string | null;
	}>;
	chronicConditions: Array<{
		diagnosisId: string;
		icd11Code: string | null;
		icd11Title: string | null;
		diagnosedBy: string | null;
		diagnosedDate: Date | null;
	}>;
	emergencyContacts: Array<{
		contactId: string;
		contactName: string;
		relationship: string;
		phoneNumber: string;
		isPrimary: boolean;
	}>;
}

export async function loadPatientMedicalIdentity(
	databaseService: DatabaseService,
	patientId: string,
): Promise<PatientMedicalIdentitySnapshot> {
	const [
		basicInfoResult,
		activeDiagnosesResult,
		currentMedicationsResult,
		allergiesResult,
		chronicConditionsResult,
		emergencyContactsResult,
	] = await Promise.all([
		databaseService.query(
			`
				SELECT
					TRIM(CONCAT_WS(' ', p.first_name, p.middle_name, p.surname)) AS full_name,
					p.gender,
					EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.date_of_birth))::INT AS age,
					p.blood_type,
					p.weight_kg,
					p.height_cm,
					doc.file_path AS profile_picture_url
				FROM patients p
				LEFT JOIN LATERAL (
					SELECT file_path
					FROM documents
					WHERE user_id = p.user_id
						AND file_type = 'PROFILE_PICTURE'
					ORDER BY uploaded_at DESC NULLS LAST, id DESC
					LIMIT 1
				) doc ON TRUE
				WHERE p.id = $1
			`,
			[patientId],
		),
		databaseService.query(
			`
				SELECT
					d.id AS diagnosis_id,
					d.icd11_code,
					d.icd11_title,
					TRIM(CONCAT_WS(' ', h.first_name, h.middle_name, h.surname)) AS diagnosed_by,
					d.diagnosed_date
				FROM diagnoses d
				LEFT JOIN clinical_encounters ce ON ce.id = d.encounter_id
				LEFT JOIN healthcare_providers h ON h.id = ce.hcp_id
				WHERE d.patient_id = $1
					AND (d.status = $2 OR d.status IS NULL)
				ORDER BY d.diagnosed_date DESC NULLS LAST, d.created_at DESC
			`,
			[patientId, DiagnosisStatus.ACTIVE],
		),
		databaseService.query(
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
				LEFT JOIN diagnoses d
					ON d.id = m.diagnosis_id
					AND d.patient_id = m.patient_id
				LEFT JOIN healthcare_providers h ON h.id = m.prescribed_by_hcp_id
				WHERE m.patient_id = $1
					AND (m.start_date IS NULL OR m.start_date <= CURRENT_DATE)
					AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
					AND (
						m.diagnosis_id IS NULL
						OR (
							d.id IS NOT NULL
							AND (d.status = $2 OR d.status IS NULL)
						)
					)
				ORDER BY m.start_date DESC NULLS LAST, m.created_at DESC
			`,
			[patientId, DiagnosisStatus.ACTIVE],
		),
		databaseService.query(
			`
				SELECT
					a.id AS allergy_id,
					a.allergen_name,
					a.severity,
					a.reaction_description,
					TRIM(CONCAT_WS(' ', h.first_name, h.middle_name, h.surname)) AS diagnosed_by,
					a.diagnosed_date
				FROM patient_allergies a
				LEFT JOIN healthcare_providers h ON h.id = a.diagnosed_by
				WHERE a.patient_id = $1
				ORDER BY a.diagnosed_date DESC NULLS LAST, a.created_at DESC
			`,
			[patientId],
		),
		databaseService.query(
			`
				SELECT
					d.id AS diagnosis_id,
					d.icd11_code,
					d.icd11_title,
					TRIM(CONCAT_WS(' ', h.first_name, h.middle_name, h.surname)) AS diagnosed_by,
					d.diagnosed_date
				FROM diagnoses d
				LEFT JOIN clinical_encounters ce ON ce.id = d.encounter_id
				LEFT JOIN healthcare_providers h ON h.id = ce.hcp_id
				WHERE d.patient_id = $1
					AND d.is_chronic = TRUE
					AND (d.status = $2 OR d.status IS NULL)
				ORDER BY d.diagnosed_date DESC NULLS LAST, d.created_at DESC
			`,
			[patientId, DiagnosisStatus.ACTIVE],
		),
		databaseService.query(
			`
				SELECT
					id AS contact_id,
					contact_name,
					relationship,
					phone_number,
					is_primary
				FROM patient_emergency_contacts
				WHERE patient_id = $1
				ORDER BY is_primary DESC, created_at ASC
			`,
			[patientId],
		),
	]);

	if (basicInfoResult.rows.length === 0) {
		throw new NotFoundException('Patient not found.');
	}

	const basicInfo = basicInfoResult.rows[0];
	const weightKg =
		basicInfo.weight_kg !== null ? Number(basicInfo.weight_kg) : null;
	const heightCm =
		basicInfo.height_cm !== null ? Number(basicInfo.height_cm) : null;

	return {
		basicInfo: {
			fullName: basicInfo.full_name,
			gender: basicInfo.gender,
			age: Number(basicInfo.age),
			bloodType: basicInfo.blood_type,
			weightKg,
			heightCm,
			bmi: calculateBmi(weightKg, heightCm),
			profilePictureUrl: basicInfo.profile_picture_url,
		},
		activeDiagnoses: activeDiagnosesResult.rows.map((row) => ({
			diagnosisId: row.diagnosis_id,
			icd11Code: row.icd11_code,
			icd11Title: row.icd11_title,
			diagnosedBy: row.diagnosed_by,
			diagnosedDate: row.diagnosed_date,
		})),
		currentMedications: currentMedicationsResult.rows.map((row) => ({
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
		allergies: allergiesResult.rows.map((row) => ({
			allergyId: row.allergy_id,
			allergenName: row.allergen_name,
			severity: row.severity,
			reactionDescription: row.reaction_description,
			diagnosedBy: row.diagnosed_by,
			diagnosedDate: row.diagnosed_date,
		})),
		chronicConditions: chronicConditionsResult.rows.map((row) => ({
			diagnosisId: row.diagnosis_id,
			icd11Code: row.icd11_code,
			icd11Title: row.icd11_title,
			diagnosedBy: row.diagnosed_by,
			diagnosedDate: row.diagnosed_date,
		})),
		emergencyContacts: emergencyContactsResult.rows.map((row) => ({
			contactId: row.contact_id,
			contactName: row.contact_name,
			relationship: row.relationship,
			phoneNumber: row.phone_number,
			isPrimary: row.is_primary,
		})),
	};
}

function calculateBmi(weightKg: number | null, heightCm: number | null) {
	if (weightKg === null || heightCm === null || heightCm <= 0) {
		return null;
	}

	const heightInMeters = heightCm / 100;
	const bmi = weightKg / (heightInMeters * heightInMeters);
	return Math.round(bmi * 100) / 100;
}
