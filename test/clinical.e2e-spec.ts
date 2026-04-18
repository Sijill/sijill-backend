import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/modules/database/database.service';
import { UserRole } from '../src/common/enums/db.enum';
import {
	createClinicalTestDatabase,
	dropClinicalTestDatabase,
} from './clinical-test-db';

const TEST_DB_HOST = process.env.DB_HOST || 'localhost';
const TEST_DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const TEST_DB_USER = process.env.DB_USER || 'khedr';
const TEST_DB_PASSWORD = process.env.DB_PASSWORD || '2004k';
const TEST_ADMIN_DB = 'postgres';
const TEST_ACCESS_SECRET = 'clinical-test-access-secret';

const PATIENT_USER_ID = '11111111-1111-1111-1111-111111111111';
const PATIENT_ID = '22222222-2222-2222-2222-222222222222';
const HCP_USER_ID = '33333333-3333-3333-3333-333333333333';
const HCP_ID = '44444444-4444-4444-4444-444444444444';
const PAST_ENCOUNTER_ID = '55555555-5555-5555-5555-555555555555';
const CHRONIC_DIAGNOSIS_ID = '66666666-6666-6666-6666-666666666666';
const ACUTE_DIAGNOSIS_ID = '77777777-7777-7777-7777-777777777777';
const CURRENT_MEDICATION_ID = '88888888-8888-8888-8888-888888888888';
const ALLERGY_ID = '99999999-9999-9999-9999-999999999999';
const CONTACT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROFILE_DOCUMENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LAB_ORDER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const LAB_DETAIL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const LAB_RESULT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const LAB_RESULT_DOCUMENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LAB_RESULT_LINK_ID = '12121212-1212-1212-1212-121212121212';
const IMAGING_ORDER_ID = '13131313-1313-1313-1313-131313131313';
const IMAGING_DETAIL_ID = '14141414-1414-1414-1414-141414141414';
const IMAGING_RESULT_ID = '15151515-1515-1515-1515-151515151515';
const IMAGING_DOCUMENT_ID = '16161616-1616-1616-1616-161616161616';
const IMAGING_RESULT_LINK_ID = '17171717-1717-1717-1717-171717171717';

describe('ClinicalModule (e2e)', () => {
	let app: INestApplication;
	let db: DatabaseService;
	let databaseName: string;
	let patientJwt: string;
	let hcpJwt: string;
	let tokenId: string;
	let sessionId: string;
	let clinicalSessionToken: string;

	beforeAll(async () => {
		databaseName = await createClinicalTestDatabase({
			host: TEST_DB_HOST,
			port: TEST_DB_PORT,
			user: TEST_DB_USER,
			password: TEST_DB_PASSWORD,
			adminDatabase: TEST_ADMIN_DB,
		});

		process.env.NODE_ENV = 'development';
		process.env.DB_HOST = TEST_DB_HOST;
		process.env.DB_PORT = TEST_DB_PORT.toString();
		process.env.DB_NAME = databaseName;
		process.env.DB_USER = TEST_DB_USER;
		process.env.DB_PASSWORD = TEST_DB_PASSWORD;
		process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
		process.env.SMTP_HOST = 'localhost';
		process.env.SMTP_PORT = '1025';
		process.env.SMTP_FROM_EMAIL = 'test@sijill.local';
		process.env.SMTP_FROM_NAME = 'Sijill Test';

		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleRef.createNestApplication();
		app.useGlobalPipes(
			new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
		);
		await app.init();

		db = app.get(DatabaseService);
		await seedClinicalTestData(db);

		patientJwt = signAccessToken({
			userId: PATIENT_USER_ID,
			email: 'patient@test.local',
			role: UserRole.PATIENT,
		});
		hcpJwt = signAccessToken({
			userId: HCP_USER_ID,
			email: 'hcp@test.local',
			role: UserRole.HEALTHCARE_PROVIDER,
		});
	});

	afterAll(async () => {
		if (app) {
			await app.close();
		}

		if (databaseName) {
			await dropClinicalTestDatabase(
				{
					host: TEST_DB_HOST,
					port: TEST_DB_PORT,
					user: TEST_DB_USER,
					password: TEST_DB_PASSWORD,
					adminDatabase: TEST_ADMIN_DB,
				},
				databaseName,
			);
		}
	});

	it('loads the schema and reference data into an isolated test database', async () => {
		const frequencyColumnResult = await db.query(
			`
				SELECT data_type, character_maximum_length
				FROM information_schema.columns
				WHERE table_name = 'medications'
					AND column_name = 'frequency'
			`,
		);
		const imagingTypes = await db.query(
			`SELECT COUNT(*)::INT AS total FROM ref_imaging_types`,
		);
		const testTypes = await db.query(
			`SELECT COUNT(*)::INT AS total FROM ref_test_types`,
		);

		expect(frequencyColumnResult.rows[0]).toMatchObject({
			data_type: 'character varying',
			character_maximum_length: 500,
		});
		expect(imagingTypes.rows[0].total).toBeGreaterThan(0);
		expect(testTypes.rows[0].total).toBeGreaterThan(0);
	});

	it('generates a patient permission token and lists it as active', async () => {
		const createResponse = await request(app.getHttpServer())
			.post('/api/v1/clinical/permission-tokens')
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({
				entityType: 'HEALTHCARE_PROVIDER',
				accessType: 'READ_WRITE',
				expiresInMinutes: 30,
			})
			.expect(201);

		tokenId = createResponse.body.tokenId;

		expect(createResponse.body.code).toMatch(/^\d{6}$/);
		expect(createResponse.body.accessType).toBe('READ_WRITE');

		const listResponse = await request(app.getHttpServer())
			.get('/api/v1/clinical/permission-tokens')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(listResponse.body.tokens).toHaveLength(1);
		expect(listResponse.body.tokens[0]).toMatchObject({
			tokenId,
			entityType: 'HEALTHCARE_PROVIDER',
			accessType: 'READ_WRITE',
			wasUsed: false,
		});

		clinicalSessionToken = createResponse.body.code;
	});

	it('lazily expires stale tokens before listing or revoke checks', async () => {
		const createResponse = await request(app.getHttpServer())
			.post('/api/v1/clinical/permission-tokens')
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({
				entityType: 'HEALTHCARE_PROVIDER',
				accessType: 'READ_ONLY',
				expiresInMinutes: 15,
			})
			.expect(201);

		const expiredTokenId = createResponse.body.tokenId;

		await db.query(
			`
				UPDATE patient_permission_tokens
				SET expires_at = NOW() - INTERVAL '5 minutes'
				WHERE id = $1
			`,
			[expiredTokenId],
		);

		const listResponse = await request(app.getHttpServer())
			.get('/api/v1/clinical/permission-tokens')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(
			listResponse.body.tokens.some(
				(token: { tokenId: string }) => token.tokenId === expiredTokenId,
			),
		).toBe(false);

		const expiredTokenStatus = await db.query(
			`
				SELECT status
				FROM patient_permission_tokens
				WHERE id = $1
			`,
			[expiredTokenId],
		);

		expect(expiredTokenStatus.rows[0].status).toBe('EXPIRED');

		const revokeResponse = await request(app.getHttpServer())
			.patch(`/api/v1/clinical/permission-tokens/${expiredTokenId}/revoke`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(403);

		expect(revokeResponse.body.message).toBe('This token is no longer active.');
	});

	it('redeems the code into a clinical session and reads the patient record', async () => {
		const startSessionResponse = await request(app.getHttpServer())
			.post('/api/v1/clinical/sessions')
			.set('Authorization', `Bearer ${hcpJwt}`)
			.send({ code: clinicalSessionToken })
			.expect(201);

		sessionId = startSessionResponse.body.sessionId;
		clinicalSessionToken = startSessionResponse.body.clinicalSessionToken;

		expect(startSessionResponse.body.accessType).toBe('READ_WRITE');
		expect(startSessionResponse.body.patient).toMatchObject({
			patientId: PATIENT_ID,
			fullName: 'Sara Ahmed Jenkins',
			gender: 'FEMALE',
		});

		const identityResponse = await request(app.getHttpServer())
			.get(`/api/v1/clinical/sessions/${sessionId}/medical-identity`)
			.set('Authorization', `Bearer ${clinicalSessionToken}`)
			.expect(200);

		expect(identityResponse.body.basicInfo).toMatchObject({
			fullName: 'Sara Ahmed Jenkins',
			gender: 'FEMALE',
			bloodType: null,
			weightKg: null,
			heightCm: null,
			profilePictureUrl: 'uploads/identity/patient-profile.jpg',
		});
		expect(identityResponse.body.activeDiagnoses).toHaveLength(2);
		expect(identityResponse.body.currentMedications).toHaveLength(1);
		expect(identityResponse.body.allergies).toHaveLength(1);
		expect(identityResponse.body.chronicConditions).toHaveLength(1);
		expect(identityResponse.body.emergencyContacts).toHaveLength(1);

		const activeTokensResponse = await request(app.getHttpServer())
			.get('/api/v1/clinical/permission-tokens')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(activeTokensResponse.body.tokens[0].wasUsed).toBe(true);
	});

	it('fills missing vitals but refuses to overwrite them later', async () => {
		const updateResponse = await request(app.getHttpServer())
			.patch(`/api/v1/clinical/sessions/${sessionId}/medical-identity`)
			.set('Authorization', `Bearer ${clinicalSessionToken}`)
			.send({
				bloodType: 'O+',
				weightKg: 68,
				heightCm: 170,
			})
			.expect(200);

		expect(updateResponse.body).toMatchObject({
			success: true,
			updatedFields: ['bloodType', 'weightKg', 'heightCm'],
			bloodType: 'O+',
			weightKg: 68,
			heightCm: 170,
		});

		const overwriteResponse = await request(app.getHttpServer())
			.patch(`/api/v1/clinical/sessions/${sessionId}/medical-identity`)
			.set('Authorization', `Bearer ${clinicalSessionToken}`)
			.send({ weightKg: 70 })
			.expect(400);

		expect(overwriteResponse.body.message).toContain(
			'weightKg is already set and cannot be overwritten.',
		);
	});

	it('returns encounter history summaries and full encounter detail', async () => {
		const historyResponse = await request(app.getHttpServer())
			.get(`/api/v1/clinical/sessions/${sessionId}/medical-history`)
			.set('Authorization', `Bearer ${clinicalSessionToken}`)
			.query({ page: 1, limit: 10 })
			.expect(200);

		expect(historyResponse.body.data).toHaveLength(1);
		expect(historyResponse.body.data[0]).toMatchObject({
			encounterId: PAST_ENCOUNTER_ID,
			hcpFullName: 'Khaled Mostafa Ali',
			hcpSpecialization: 'Pulmonology',
			primaryDiagnosis: {
				icd11Code: 'CA23',
				icd11Title: 'Asthma',
			},
		});

		const detailResponse = await request(app.getHttpServer())
			.get(
				`/api/v1/clinical/sessions/${sessionId}/medical-history/${PAST_ENCOUNTER_ID}`,
			)
			.set('Authorization', `Bearer ${clinicalSessionToken}`)
			.expect(200);

		expect(detailResponse.body).toMatchObject({
			encounterId: PAST_ENCOUNTER_ID,
			hcpFullName: 'Khaled Mostafa Ali',
			hcpSpecialization: 'Pulmonology',
		});
		expect(detailResponse.body.symptoms).toHaveLength(1);
		expect(detailResponse.body.diagnoses).toHaveLength(2);
		expect(detailResponse.body.medications).toHaveLength(1);
		expect(detailResponse.body.orders).toHaveLength(2);
		expect(
			detailResponse.body.orders[0].labOrder.result.documents,
		).toHaveLength(1);
		expect(
			detailResponse.body.orders[1].imagingOrder.result.documents,
		).toHaveLength(1);
	});

	it('creates a new encounter atomically and records notifications', async () => {
		const createResponse = await request(app.getHttpServer())
			.post(`/api/v1/clinical/sessions/${sessionId}/encounters`)
			.set('Authorization', `Bearer ${clinicalSessionToken}`)
			.send({
				locationAddress: 'Cairo Medical Center, 99 Tahrir St, Cairo',
				symptoms: [
					{
						title: 'Shortness of breath',
						description: 'Worse after climbing stairs',
					},
				],
				diagnoses: [
					{
						icd11Code: 'BD11',
						icd11Title: 'Bronchitis',
						clinicalDescription: 'Acute bronchitis after viral infection',
						isChronic: false,
					},
				],
				medications: [
					{
						medicationName: 'Azithromycin',
						dosageAmount: 500,
						dosageUnit: 'MG',
						form: 'TABLET',
						frequency: 'After breakfast once daily for 5 days',
						startDate: '2026-04-18',
						endDate: '2026-04-22',
						instructions: 'Take after food',
						diagnosisIndex: 0,
					},
				],
				labOrders: [
					{
						testTypeId: 1,
						specimenTypeId: 1,
						priority: 'ROUTINE',
						fastingRequired: false,
						clinicalIndication: 'Check CBC after fatigue',
					},
				],
				imagingOrders: [
					{
						imagingTypeId: 3,
						bodyPartId: 3,
						priority: 'URGENT',
						contrastUsed: false,
						clinicalIndication: 'Evaluate chest pain',
					},
				],
				allergies: [
					{
						allergenName: 'Dust',
						severity: 'MILD',
						reactionDescription: 'Sneezing and watery eyes',
					},
				],
				nextAppointmentDate: '2026-05-01T09:00:00.000Z',
				appointmentNotes: 'Review response to antibiotics',
			})
			.expect(201);

		expect(createResponse.body).toMatchObject({
			success: true,
			message: 'Encounter recorded successfully',
			notificationsCreated: 4,
		});
		expect(createResponse.body.encounterId).toMatch(/^[0-9a-f-]{36}$/i);

		const encounterQuery = await db.query(
			`
				SELECT COUNT(*)::INT AS total
				FROM clinical_encounters
				WHERE patient_id = $1
			`,
			[PATIENT_ID],
		);
		const notificationQuery = await db.query(
			`
				SELECT notification_type, COUNT(*)::INT AS total
				FROM notifications
				WHERE user_id = $1
				GROUP BY notification_type
			`,
			[PATIENT_USER_ID],
		);

		expect(encounterQuery.rows[0].total).toBe(2);
		expect(notificationQuery.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					notification_type: 'APPOINTMENT_REMINDER',
					total: 1,
				}),
				expect.objectContaining({
					notification_type: 'MEDICATION_REMINDER',
					total: 1,
				}),
				expect.objectContaining({
					notification_type: 'MEDICAL_ORDER',
					total: 2,
				}),
			]),
		);
	});

	it('revokes the permission token and blocks further clinical-session access', async () => {
		const revokeResponse = await request(app.getHttpServer())
			.patch(`/api/v1/clinical/permission-tokens/${tokenId}/revoke`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(revokeResponse.body).toMatchObject({
			success: true,
			tokenId,
			message: 'Token revoked successfully',
		});

		await request(app.getHttpServer())
			.get(`/api/v1/clinical/sessions/${sessionId}/medical-identity`)
			.set('Authorization', `Bearer ${clinicalSessionToken}`)
			.expect(403);
	});
});

function signAccessToken(payload: {
	userId: string;
	email: string;
	role: UserRole;
}) {
	return jwt.sign(payload, TEST_ACCESS_SECRET, { expiresIn: '15m' });
}

async function seedClinicalTestData(db: DatabaseService) {
	await db.query(
		`
			INSERT INTO users
				(
					id,
					email,
					phone_number,
					password_hash,
					role,
					account_status,
					email_verified
				)
			VALUES
				($1, $2, $3, $4, $5, 'VERIFIED', TRUE),
				($6, $7, $8, $9, $10, 'VERIFIED', TRUE)
		`,
		[
			PATIENT_USER_ID,
			'patient@test.local',
			'+201000000001',
			'hashed-password',
			UserRole.PATIENT,
			HCP_USER_ID,
			'hcp@test.local',
			'+201000000002',
			'hashed-password',
			UserRole.HEALTHCARE_PROVIDER,
		],
	);

	await db.query(
		`
			INSERT INTO patients
				(
					id,
					user_id,
					first_name,
					middle_name,
					surname,
					gender,
					date_of_birth,
					national_id,
					blood_type,
					weight_kg,
					height_cm
				)
			VALUES ($1, $2, 'Sara', 'Ahmed', 'Jenkins', 'FEMALE', '1992-06-14', '12345678901234', NULL, NULL, NULL)
		`,
		[PATIENT_ID, PATIENT_USER_ID],
	);

	await db.query(
		`
			INSERT INTO healthcare_providers
				(
					id,
					user_id,
					first_name,
					middle_name,
					surname,
					gender,
					date_of_birth,
					national_id,
					medical_license_number,
					specialization,
					workplace_name,
					workplace_address
				)
			VALUES (
				$1,
				$2,
				'Khaled',
				'Mostafa',
				'Ali',
				'MALE',
				'1985-03-20',
				'23456789012345',
				'LIC-12345',
				'Pulmonology',
				'Cairo Medical Center',
				'12 Tahrir St, Cairo'
			)
		`,
		[HCP_ID, HCP_USER_ID],
	);

	await db.query(
		`
			INSERT INTO documents
				(id, user_id, file_type, file_path, file_name, mime_type, file_size_bytes, uploaded_at)
			VALUES
				($1, $2, 'PROFILE_PICTURE', 'uploads/identity/patient-profile.jpg', 'patient-profile.jpg', 'image/jpeg', 2048, '2026-03-01T09:00:00.000Z'),
				($3, $2, 'LAB_RESULT', 'uploads/clinical/cbc-result.pdf', 'cbc-result.pdf', 'application/pdf', 4096, '2026-03-12T14:00:00.000Z'),
				($4, $2, 'IMAGING_RESULT', 'uploads/clinical/chest-mri.pdf', 'chest-mri.pdf', 'application/pdf', 5120, '2026-03-12T16:00:00.000Z')
		`,
		[
			PROFILE_DOCUMENT_ID,
			PATIENT_USER_ID,
			LAB_RESULT_DOCUMENT_ID,
			IMAGING_DOCUMENT_ID,
		],
	);

	await db.query(
		`
			INSERT INTO patient_emergency_contacts
				(id, patient_id, contact_name, phone_number, relationship, is_primary)
			VALUES ($1, $2, 'Ahmed Jenkins', '+201012345678', 'SPOUSE', TRUE)
		`,
		[CONTACT_ID, PATIENT_ID],
	);

	await db.query(
		`
			INSERT INTO clinical_encounters
				(id, patient_id, hcp_id, encounter_date, location_address, next_appointment_date, appointment_notes)
			VALUES (
				$1,
				$2,
				$3,
				'2026-03-10T09:30:00.000Z',
				'Cairo Medical Center, 12 Tahrir St, Cairo',
				'2026-04-10T10:00:00.000Z',
				'Follow up on blood test results'
			)
		`,
		[PAST_ENCOUNTER_ID, PATIENT_ID, HCP_ID],
	);

	await db.query(
		`
			INSERT INTO encounter_symptoms_complaints
				(id, encounter_id, title, description)
			VALUES (
				gen_random_uuid(),
				$1,
				'Persistent dry cough',
				'Patient reports cough lasting 3 weeks, worse at night'
			)
		`,
		[PAST_ENCOUNTER_ID],
	);

	await db.query(
		`
			INSERT INTO diagnoses
				(
					id,
					encounter_id,
					patient_id,
					icd11_code,
					icd11_title,
					clinical_description,
					is_chronic,
					status,
					diagnosed_date
				)
			VALUES
				(
					$4,
					$2,
					$3,
					'CA23',
					'Asthma',
					'Mild intermittent asthma',
					FALSE,
					'ACTIVE',
					'2026-03-10T09:40:00.000Z'
				),
				(
					$1,
					$2,
					$3,
					'5A11',
					'Type 2 diabetes mellitus',
					'Known chronic condition under treatment',
					TRUE,
					'ACTIVE',
					'2023-06-01T00:00:00.000Z'
				)
		`,
		[CHRONIC_DIAGNOSIS_ID, PAST_ENCOUNTER_ID, PATIENT_ID, ACUTE_DIAGNOSIS_ID],
	);

	await db.query(
		`
			INSERT INTO medications
				(
					id,
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
			VALUES (
				$1,
				$2,
				$3,
				$4,
				$5,
				'Salbutamol',
				100,
				'MCG',
				'INHALER',
				'Use 2 puffs when needed for shortness of breath',
				'2020-01-01',
				'2099-12-31',
				'Use 2 puffs when experiencing shortness of breath',
				'2026-01-01T10:00:00.000Z'
			)
		`,
		[
			CURRENT_MEDICATION_ID,
			PAST_ENCOUNTER_ID,
			PATIENT_ID,
			ACUTE_DIAGNOSIS_ID,
			HCP_ID,
		],
	);

	await db.query(
		`
			INSERT INTO patient_allergies
				(
					id,
					patient_id,
					allergen_name,
					severity,
					reaction_description,
					diagnosed_by,
					diagnosed_date
				)
			VALUES (
				$1,
				$2,
				'Penicillin',
				'SEVERE',
				'Anaphylactic reaction',
				$3,
				'2025-03-15'
			)
		`,
		[ALLERGY_ID, PATIENT_ID, HCP_ID],
	);

	await db.query(
		`
			INSERT INTO medical_orders
				(id, encounter_id, patient_id, ordered_by_hcp_id, order_type, order_status, ordered_at, updated_at)
			VALUES
				($1, $2, $3, $4, 'LABORATORY', 'COMPLETED', '2026-03-10T09:45:00.000Z', NOW()),
				($5, $2, $3, $4, 'IMAGING', 'COMPLETED', '2026-03-10T10:00:00.000Z', NOW())
		`,
		[LAB_ORDER_ID, PAST_ENCOUNTER_ID, PATIENT_ID, HCP_ID, IMAGING_ORDER_ID],
	);

	await db.query(
		`
			INSERT INTO lab_orders
				(id, medical_order_id, test_type_id, specimen_type_id, fasting_required, priority, clinical_indication)
			VALUES (
				$1,
				$2,
				1,
				1,
				FALSE,
				'ROUTINE',
				'Rule out anaemia'
			)
		`,
		[LAB_DETAIL_ID, LAB_ORDER_ID],
	);

	await db.query(
		`
			INSERT INTO lab_results
				(id, order_id, patient_id, lab_id, result_data, additional_notes, uploaded_at, uploaded_by_user_id)
			VALUES (
				$1,
				$2,
				$3,
				NULL,
				'{"haemoglobin":"13.5 g/dL","WBC":"7.2 x10^9/L"}'::jsonb,
				'All values within normal range',
				'2026-03-12T14:00:00.000Z',
				$4
			)
		`,
		[LAB_RESULT_ID, LAB_ORDER_ID, PATIENT_ID, HCP_USER_ID],
	);

	await db.query(
		`
			INSERT INTO lab_result_documents
				(id, lab_result_id, document_id)
			VALUES ($1, $2, $3)
		`,
		[LAB_RESULT_LINK_ID, LAB_RESULT_ID, LAB_RESULT_DOCUMENT_ID],
	);

	await db.query(
		`
			INSERT INTO imaging_orders
				(id, medical_order_id, imaging_type_id, body_part_id, contrast_used, priority, clinical_indication)
			VALUES (
				$1,
				$2,
				3,
				3,
				FALSE,
				'ROUTINE',
				'Evaluate lung hyperinflation'
			)
		`,
		[IMAGING_DETAIL_ID, IMAGING_ORDER_ID],
	);

	await db.query(
		`
			INSERT INTO imaging_results
				(id, order_id, patient_id, imaging_center_id, study_description, findings, uploaded_at, uploaded_by_user_id)
			VALUES (
				$1,
				$2,
				$3,
				NULL,
				'Chest MRI without contrast',
				'No significant abnormalities detected',
				'2026-03-12T16:00:00.000Z',
				$4
			)
		`,
		[IMAGING_RESULT_ID, IMAGING_ORDER_ID, PATIENT_ID, HCP_USER_ID],
	);

	await db.query(
		`
			INSERT INTO imaging_result_documents
				(id, imaging_result_id, document_id)
			VALUES ($1, $2, $3)
		`,
		[IMAGING_RESULT_LINK_ID, IMAGING_RESULT_ID, IMAGING_DOCUMENT_ID],
	);
}
