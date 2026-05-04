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
const OTHER_PATIENT_USER_ID = '20202020-2020-2020-2020-202020202020';
const OTHER_PATIENT_ID = '21212121-2121-2121-2121-212121212121';
const PAST_ENCOUNTER_ID = '55555555-5555-5555-5555-555555555555';
const CHRONIC_DIAGNOSIS_ID = '66666666-6666-6666-6666-666666666666';
const ACUTE_DIAGNOSIS_ID = '77777777-7777-7777-7777-777777777777';
const CURRENT_MEDICATION_ID = '88888888-8888-8888-8888-888888888888';
const ALLERGY_ID = '99999999-9999-9999-9999-999999999999';
const CONTACT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROFILE_DOCUMENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LAB_ORDER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const LAB_RESULT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const LAB_RESULT_DOCUMENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LAB_RESULT_LINK_ID = '12121212-1212-1212-1212-121212121212';
const IMAGING_ORDER_ID = '13131313-1313-1313-1313-131313131313';
const IMAGING_RESULT_ID = '15151515-1515-1515-1515-151515151515';
const IMAGING_DOCUMENT_ID = '16161616-1616-1616-1616-161616161616';
const IMAGING_RESULT_LINK_ID = '17171717-1717-1717-1717-171717171717';
const PENDING_IMAGING_ORDER_ID = '18181818-1818-1818-1818-181818181818';
const PREVIOUS_JOURNAL_NOTE_ID = '19191919-1919-1919-1919-191919191919';

describe('ClinicalModule (e2e)', () => {
	let app: INestApplication;
	let db: DatabaseService;
	let databaseName: string;
	let originalFetch: typeof fetch | undefined;
	let patientJwt: string;
	let otherPatientJwt: string;
	let hcpJwt: string;
	let tokenId: string;
	let sessionId: string;
	let clinicalSessionToken: string;
	let createdEncounterId: string;

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
		process.env.GEMINI_API_KEY = 'clinical-test-gemini-key';
		process.env.GEMINI_MODEL = 'gemini-2.5-flash';
		process.env.SMTP_HOST = 'localhost';
		process.env.SMTP_PORT = '1025';
		process.env.SMTP_FROM_EMAIL = 'test@sijill.local';
		process.env.SMTP_FROM_NAME = 'Sijill Test';
		originalFetch = global.fetch;

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
		otherPatientJwt = signAccessToken({
			userId: OTHER_PATIENT_USER_ID,
			email: 'other.patient@test.local',
			role: UserRole.PATIENT,
		});
		hcpJwt = signAccessToken({
			userId: HCP_USER_ID,
			email: 'hcp@test.local',
			role: UserRole.HEALTHCARE_PROVIDER,
		});
	});

	afterAll(async () => {
		global.fetch = originalFetch as typeof fetch;

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

	it('returns the patient medical identity for the mobile app endpoint', async () => {
		const response = await request(app.getHttpServer())
			.get('/api/v1/patient/medical-identity')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(response.body.basicInfo).toMatchObject({
			age: expect.any(Number),
			gender: 'FEMALE',
			bloodType: null,
			weightKg: null,
			heightCm: null,
			bmi: null,
		});
		expect(response.body.activeDiagnoses).toHaveLength(2);
		expect(response.body.currentMedications).toEqual([
			expect.objectContaining({
				medicationName: 'Salbutamol',
				dosageAmount: 100,
				dosageUnit: 'MCG',
				form: 'INHALER',
				prescribedBy: 'Khaled Mostafa Ali',
			}),
		]);
		expect(response.body.allergies).toEqual([
			expect.objectContaining({
				allergenName: 'Penicillin',
				icd11Title: 'Penicillin',
				severity: 'SEVERE',
				reactionDescription: 'Anaphylactic reaction',
				diagnosedBy: 'Khaled Mostafa Ali',
			}),
		]);
		expect(response.body.chronicConditions).toHaveLength(1);
		expect(response.body.emergencyContacts).toEqual([
			expect.objectContaining({
				contactId: CONTACT_ID,
				contactName: 'Ahmed Jenkins',
				relationship: 'SPOUSE',
				phoneNumber: '+201012345678',
				isPrimary: true,
			}),
		]);
	});

	it('lists active diagnoses for the health journal with diagnosis ids', async () => {
		const response = await request(app.getHttpServer())
			.get('/api/v1/patient/health-journal/diagnoses')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(response.body.diagnoses).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					diagnosisId: ACUTE_DIAGNOSIS_ID,
					icd11Code: 'CA23',
					icd11Title: 'Asthma',
					isChronic: false,
				}),
				expect.objectContaining({
					diagnosisId: CHRONIC_DIAGNOSIS_ID,
					icd11Code: '5A11',
					icd11Title: 'Type 2 diabetes mellitus',
					isChronic: true,
				}),
			]),
		);
	});

	it('creates a health journal note and returns an AI health snapshot', async () => {
		const fetchMock = jest.fn().mockResolvedValue({
			ok: true,
			json: jest.fn().mockResolvedValue({
				candidates: [
					{
						content: {
							parts: [
								{
									text: JSON.stringify({
										urgencyLevel: 'MEDIUM',
										summary:
											'Your note suggests a symptom flare that should be watched closely.',
										advice: [
											'Follow the asthma care plan your clinician already gave you.',
											'Keep activity light today and monitor whether the pain and fatigue settle.',
										],
										watchouts: [
											'Rising pain or breathing discomfort would be a reason to contact your clinician sooner.',
										],
										whenToContactDoctor: [
											'Reach out if symptoms keep getting worse over the next day.',
										],
										disclaimer:
											'This guidance supports but does not replace medical care.',
									}),
								},
							],
						},
					},
				],
			}),
		});
		global.fetch = fetchMock as typeof fetch;

		const response = await request(app.getHttpServer())
			.post('/api/v1/patient/health-journal/notes')
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({
				diagnosisId: ACUTE_DIAGNOSIS_ID,
				patientOutcome: 'WORSE',
				patientOutcomeDetails:
					'Cough felt tighter after climbing stairs today.',
				painLevel: 7,
				energyLevel: 3,
				mood: 'More tired today after walking and a little anxious.',
			})
			.expect(201);

		expect(response.body.entry).toMatchObject({
			diagnosisId: ACUTE_DIAGNOSIS_ID,
			patientOutcome: 'WORSE',
			patientOutcomeDetails: 'Cough felt tighter after climbing stairs today.',
			painLevel: 7,
			energyLevel: 3,
			mood: 'More tired today after walking and a little anxious.',
			diagnosis: {
				icd11Title: 'Asthma',
			},
		});
		expect(response.body.healthSnapshot).toMatchObject({
			status: 'READY',
			model: 'gemini-2.5-flash',
			urgencyLevel: 'MEDIUM',
		});
		expect(response.body.healthSnapshot.advice).toHaveLength(2);

		const storedNotes = await db.query(
			`
				SELECT
					COUNT(*)::INT AS total,
					MAX(mood) AS latest_mood
				FROM patient_health_notes
				WHERE patient_id = $1
			`,
			[PATIENT_ID],
		);

		expect(storedNotes.rows[0]).toMatchObject({
			total: 2,
			latest_mood: 'More tired today after walking and a little anxious.',
		});

		const geminiRequest = fetchMock.mock.calls[0]?.[1];
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toContain(
			'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
		);
		expect(geminiRequest.headers).toMatchObject({
			'Content-Type': 'application/json',
		});

		const geminiPayload = JSON.parse(geminiRequest.body as string);
		const prompt = geminiPayload.contents[0].parts[0].text as string;

		expect(prompt).toContain('Penicillin');
		expect(prompt).toContain('Persistent cough follow-up');
		expect(prompt).toContain('Slept a little better last night');
		expect(prompt).toContain(
			'More tired today after walking and a little anxious.',
		);
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

	it('creates a multi-item encounter, stores all linked records correctly, and exposes them through identity/history', async () => {
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
					{
						title: 'Chest tightness',
						description: 'Mostly in the evening',
					},
				],
				diagnoses: [
					{
						icd11Code: 'BD11',
						icd11Title: 'Bronchitis',
						clinicalDescription: 'Acute bronchitis after viral infection',
						isChronic: false,
					},
					{
						icd11Code: 'BA00',
						icd11Title: 'Hypertension',
						clinicalDescription: 'Elevated blood pressure requiring follow-up',
						isChronic: true,
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
						endDate: '2026-05-02',
						instructions: 'Take after food',
						diagnosisIndex: 0,
					},
					{
						medicationName: 'Amlodipine',
						dosageAmount: 5,
						dosageUnit: 'MG',
						form: 'TABLET',
						frequency: 'Once daily at night',
						startDate: '2026-04-18',
						instructions: 'Monitor blood pressure twice weekly',
						diagnosisIndex: 1,
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
					{
						testTypeId: 2,
						specimenTypeId: 1,
						priority: 'URGENT',
						fastingRequired: true,
						clinicalIndication: 'Assess metabolic status after elevated BP',
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
					{
						imagingTypeId: 1,
						bodyPartId: 1,
						priority: 'ROUTINE',
						contrastUsed: false,
						clinicalIndication: 'Investigate persistent headaches',
					},
				],
				allergies: [
					{
						allergenName: 'Dust',
						severity: 'MILD',
						reactionDescription: 'Sneezing and watery eyes',
					},
					{
						allergenName: 'Ibuprofen',
						severity: 'MODERATE',
						reactionDescription: 'Facial rash',
					},
				],
				nextAppointmentDate: '2026-05-01T09:00:00.000Z',
				appointmentNotes: 'Review response to antibiotics',
			})
			.expect(201);

		expect(createResponse.body).toMatchObject({
			success: true,
			message: 'Encounter recorded successfully',
			notificationsCreated: 3,
		});
		expect(createResponse.body.encounterId).toMatch(/^[0-9a-f-]{36}$/i);
		createdEncounterId = createResponse.body.encounterId;

		const encounterMetaQuery = await db.query(
			`
				SELECT
					patient_id,
					hcp_id,
					location_address,
					next_appointment_date,
					appointment_notes
				FROM clinical_encounters
				WHERE id = $1
			`,
			[createdEncounterId],
		);
		const diagnosesQuery = await db.query(
			`
				SELECT icd11_code, icd11_title, is_chronic, status
				FROM diagnoses
				WHERE encounter_id = $1
				ORDER BY created_at ASC
			`,
			[createdEncounterId],
		);
		const medicationsQuery = await db.query(
			`
				SELECT
					m.medication_name,
					d.icd11_code,
					m.prescribed_by_hcp_id,
					m.start_date,
					m.end_date
				FROM medications m
				LEFT JOIN diagnoses d ON d.id = m.diagnosis_id
				WHERE m.encounter_id = $1
				ORDER BY m.created_at ASC
			`,
			[createdEncounterId],
		);
		const allergiesQuery = await db.query(
			`
				SELECT allergen_name, severity, diagnosed_by
				FROM patient_allergies
				WHERE patient_id = $1
					AND allergen_name IN ('Dust', 'Ibuprofen')
				ORDER BY allergen_name ASC
			`,
			[PATIENT_ID],
		);
		const ordersQuery = await db.query(
			`
				SELECT order_type, COUNT(*)::INT AS total
				FROM medical_orders
				WHERE encounter_id = $1
				GROUP BY order_type
			`,
			[createdEncounterId],
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
		const reminderQuery = await db.query(
			`
				SELECT reminder_type, COUNT(*)::INT AS total
				FROM reminders
				WHERE patient_id = $1
					AND (
						encounter_id = $2
						OR medication_id IN (
							SELECT id FROM medications WHERE encounter_id = $2
						)
						OR medical_order_id IN (
							SELECT id FROM medical_orders WHERE encounter_id = $2
						)
					)
				GROUP BY reminder_type
			`,
			[PATIENT_ID, createdEncounterId],
		);
		const identityResponse = await request(app.getHttpServer())
			.get(`/api/v1/clinical/sessions/${sessionId}/medical-identity`)
			.set('Authorization', `Bearer ${clinicalSessionToken}`)
			.expect(200);
		const historyResponse = await request(app.getHttpServer())
			.get(`/api/v1/clinical/sessions/${sessionId}/medical-history`)
			.set('Authorization', `Bearer ${clinicalSessionToken}`)
			.query({ page: 1, limit: 10 })
			.expect(200);
		const detailResponse = await request(app.getHttpServer())
			.get(
				`/api/v1/clinical/sessions/${sessionId}/medical-history/${createdEncounterId}`,
			)
			.set('Authorization', `Bearer ${clinicalSessionToken}`)
			.expect(200);

		expect(encounterMetaQuery.rows[0]).toMatchObject({
			patient_id: PATIENT_ID,
			hcp_id: HCP_ID,
			location_address: 'Cairo Medical Center, 99 Tahrir St, Cairo',
			appointment_notes: 'Review response to antibiotics',
		});
		expect(diagnosesQuery.rows).toEqual([
			expect.objectContaining({
				icd11_code: 'BD11',
				icd11_title: 'Bronchitis',
				is_chronic: false,
				status: 'ACTIVE',
			}),
			expect.objectContaining({
				icd11_code: 'BA00',
				icd11_title: 'Hypertension',
				is_chronic: true,
				status: 'ACTIVE',
			}),
		]);
		expect(medicationsQuery.rows).toEqual([
			expect.objectContaining({
				medication_name: 'Azithromycin',
				icd11_code: 'BD11',
				prescribed_by_hcp_id: HCP_ID,
			}),
			expect.objectContaining({
				medication_name: 'Amlodipine',
				icd11_code: 'BA00',
				prescribed_by_hcp_id: HCP_ID,
			}),
		]);
		expect(allergiesQuery.rows).toEqual([
			expect.objectContaining({
				allergen_name: 'Dust',
				severity: 'MILD',
				diagnosed_by: HCP_ID,
			}),
			expect.objectContaining({
				allergen_name: 'Ibuprofen',
				severity: 'MODERATE',
				diagnosed_by: HCP_ID,
			}),
		]);
		expect(ordersQuery.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					order_type: 'IMAGING',
					total: 2,
				}),
				expect.objectContaining({
					order_type: 'LABORATORY',
					total: 2,
				}),
			]),
		);
		expect(notificationQuery.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					notification_type: 'SYSTEM',
					total: 2,
				}),
				expect.objectContaining({
					notification_type: 'REMINDER',
					total: 2,
				}),
			]),
		);
		expect(reminderQuery.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					reminder_type: 'APPOINTMENT',
					total: 1,
				}),
				expect.objectContaining({
					reminder_type: 'MEDICATION',
					total: 2,
				}),
				expect.objectContaining({
					reminder_type: 'MEDICAL_ORDER',
					total: 4,
				}),
			]),
		);

		expect(identityResponse.body.activeDiagnoses).toHaveLength(4);
		expect(identityResponse.body.currentMedications).toHaveLength(3);
		expect(identityResponse.body.allergies).toHaveLength(3);
		expect(identityResponse.body.chronicConditions).toHaveLength(2);
		expect(historyResponse.body.data).toHaveLength(2);
		expect(historyResponse.body.data[0]).toMatchObject({
			encounterId: createdEncounterId,
			primaryDiagnosis: {
				icd11Code: 'BD11',
				icd11Title: 'Bronchitis',
			},
		});
		expect(detailResponse.body).toMatchObject({
			encounterId: createdEncounterId,
			hcpFullName: 'Khaled Mostafa Ali',
			hcpSpecialization: 'Pulmonology',
			locationAddress: 'Cairo Medical Center, 99 Tahrir St, Cairo',
			nextAppointmentDate: '2026-05-01T09:00:00.000Z',
			appointmentNotes: 'Review response to antibiotics',
		});
		expect(detailResponse.body.symptoms).toHaveLength(2);
		expect(detailResponse.body.diagnoses).toHaveLength(2);
		expect(detailResponse.body.medications).toHaveLength(2);
		expect(detailResponse.body.orders).toHaveLength(4);
	});

	it('creates exact reminder facts and notification delivery rows for token access and encounter events', async () => {
		const reminders = await db.query(
			`
				SELECT
					r.id,
					r.reminder_type,
					r.starts_at::text AS starts_at,
					r.ends_at::text AS ends_at,
					r.appointment_at,
					r.reminder_time,
					r.custom_days,
					r.is_active,
					r.medication_id,
					r.medical_order_id,
					r.encounter_id,
					m.medication_name,
					mo.order_type
				FROM reminders r
				LEFT JOIN medications m ON m.id = r.medication_id
				LEFT JOIN medical_orders mo ON mo.id = r.medical_order_id
				WHERE r.patient_id = $1
					AND (
						r.encounter_id = $2
						OR r.medication_id IN (
							SELECT id FROM medications WHERE encounter_id = $2
						)
						OR r.medical_order_id IN (
							SELECT id FROM medical_orders WHERE encounter_id = $2
						)
					)
				ORDER BY r.reminder_type ASC, r.created_at ASC
			`,
			[PATIENT_ID, createdEncounterId],
		);

		const appointmentReminders = reminders.rows.filter(
			(row) => row.reminder_type === 'APPOINTMENT',
		);
		const medicationReminders = reminders.rows.filter(
			(row) => row.reminder_type === 'MEDICATION',
		);
		const orderReminders = reminders.rows.filter(
			(row) => row.reminder_type === 'MEDICAL_ORDER',
		);

		expect(appointmentReminders).toHaveLength(1);
		expect(medicationReminders).toHaveLength(2);
		expect(orderReminders).toHaveLength(4);

		expect(appointmentReminders[0]).toMatchObject({
			encounter_id: createdEncounterId,
			medication_id: null,
			medical_order_id: null,
			reminder_time: '09:00:00',
			custom_days: null,
			is_active: true,
		});
		expect(toIso(appointmentReminders[0].appointment_at)).toBe(
			'2026-05-01T09:00:00.000Z',
		);

		expect(medicationReminders).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					medication_name: 'Azithromycin',
					encounter_id: null,
					medical_order_id: null,
					reminder_time: '09:00:00',
					custom_days: null,
					is_active: true,
				}),
				expect.objectContaining({
					medication_name: 'Amlodipine',
					encounter_id: null,
					medical_order_id: null,
					reminder_time: '09:00:00',
					custom_days: null,
					is_active: true,
				}),
			]),
		);
		const azithromycinReminder = medicationReminders.find(
			(row) => row.medication_name === 'Azithromycin',
		);
		const amlodipineReminder = medicationReminders.find(
			(row) => row.medication_name === 'Amlodipine',
		);
		expect(azithromycinReminder).toBeDefined();
		expect(amlodipineReminder).toBeDefined();
		expect(toDateOnly(azithromycinReminder!.starts_at)).toBe('2026-04-18');
		expect(toDateOnly(azithromycinReminder!.ends_at)).toBe('2026-05-02');
		expect(toDateOnly(amlodipineReminder!.starts_at)).toBe('2026-04-18');
		expect(amlodipineReminder!.ends_at).toBeNull();

		expect(orderReminders).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					order_type: 'LABORATORY',
					encounter_id: null,
					medication_id: null,
					reminder_time: '09:00:00',
					custom_days: null,
					is_active: true,
				}),
				expect.objectContaining({
					order_type: 'IMAGING',
					encounter_id: null,
					medication_id: null,
					reminder_time: '09:00:00',
					custom_days: null,
					is_active: true,
				}),
			]),
		);

		const notifications = await db.query(
			`
				SELECT
					id,
					notification_type,
					status,
					title,
					message,
					reminder_id,
					scheduled_for
				FROM notifications
				WHERE user_id = $1
				ORDER BY created_at ASC, scheduled_for ASC
			`,
			[PATIENT_USER_ID],
		);

		expect(notifications.rows).toHaveLength(4);
		expect(notifications.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					notification_type: 'SYSTEM',
					status: 'PENDING',
					title: 'Account Access',
					message:
						'Dr. Khaled Mostafa Ali accessed your account with read write access',
					reminder_id: null,
				}),
				expect.objectContaining({
					notification_type: 'SYSTEM',
					status: 'PENDING',
					title: 'New Encounter Added',
					message:
						'Dr. Khaled Mostafa Ali added a new encounter to your medical history',
					reminder_id: null,
				}),
			]),
		);

		const appointmentNotifications = notifications.rows.filter(
			(row) => row.reminder_id === appointmentReminders[0].id,
		);
		expect(appointmentNotifications).toHaveLength(2);
		expect(appointmentNotifications).toEqual([
			expect.objectContaining({
				notification_type: 'REMINDER',
				title: 'Upcoming Appointment',
				message:
					'You have an appointment with Dr. Khaled Mostafa Ali tomorrow at 9:00 AM',
			}),
			expect.objectContaining({
				notification_type: 'REMINDER',
				title: 'Appointment Soon',
				message: 'Your appointment with Dr. Khaled Mostafa Ali is in 1 hour',
			}),
		]);
		expect(toIso(appointmentNotifications[0].scheduled_for)).toBe(
			'2026-04-30T09:00:00.000Z',
		);
		expect(toIso(appointmentNotifications[1].scheduled_for)).toBe(
			'2026-05-01T08:00:00.000Z',
		);

		const medicationNotificationCount = await db.query(
			`
				SELECT COUNT(*)::INT AS total
				FROM notifications
				WHERE reminder_id IN (
					SELECT id FROM reminders WHERE medication_id IS NOT NULL
				)
			`,
		);
		expect(medicationNotificationCount.rows[0].total).toBe(0);
	});

	it('returns active reminders grouped for Flutter scheduling through both reminder endpoints', async () => {
		const response = await request(app.getHttpServer())
			.get('/api/v1/patient/reminders')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);
		const activeResponse = await request(app.getHttpServer())
			.get('/api/v1/patient/reminders/active')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(response.body.reminders).toHaveLength(7);
		expect(response.body.grouped.appointments).toHaveLength(1);
		expect(response.body.grouped.medications).toHaveLength(2);
		expect(response.body.grouped.medicalOrders).toHaveLength(4);
		expect(activeResponse.body.grouped).toEqual(response.body.grouped);

		expect(response.body.grouped.appointments[0]).toMatchObject({
			reminderType: 'APPOINTMENT',
			reminderTime: '09:00:00',
			customDays: null,
			isActive: true,
			appointmentAt: '2026-05-01T09:00:00.000Z',
			appointment: {
				encounterId: createdEncounterId,
				doctorName: 'Khaled Mostafa Ali',
				location: 'Cairo Medical Center, 99 Tahrir St, Cairo',
				notes: 'Review response to antibiotics',
			},
		});

		expect(response.body.grouped.medications).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					reminderType: 'MEDICATION',
					reminderTime: '09:00:00',
					customDays: null,
					isActive: true,
					medication: expect.objectContaining({
						name: 'Amlodipine',
						dosageAmount: 5,
						dosageUnit: 'MG',
						frequency: 'Once daily at night',
						prescribedBy: 'Khaled Mostafa Ali',
					}),
				}),
			]),
		);

		expect(response.body.grouped.medicalOrders).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					reminderType: 'MEDICAL_ORDER',
					reminderTime: '09:00:00',
					customDays: null,
					isActive: true,
					medicalOrder: expect.objectContaining({
						orderType: 'LABORATORY',
						orderName: 'COMPLETE_BLOOD_COUNT',
						priority: 'ROUTINE',
						status: 'PENDING',
						orderedBy: 'Khaled Mostafa Ali',
					}),
				}),
				expect.objectContaining({
					medicalOrder: expect.objectContaining({
						orderType: 'IMAGING',
						orderName: 'MRI',
						bodyPart: 'CHEST',
					}),
				}),
			]),
		);
	});

	it('allows only medication customization and medical-order dismissal', async () => {
		const remindersResponse = await request(app.getHttpServer())
			.get('/api/v1/patient/reminders')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		const medicationReminder = remindersResponse.body.grouped.medications.find(
			(reminder: { medication: { name: string } }) =>
				reminder.medication.name === 'Amlodipine',
		);
		const appointmentReminder = remindersResponse.body.grouped.appointments[0];
		const orderReminder = remindersResponse.body.grouped.medicalOrders[0];

		const updatedMedicationReminder = await request(app.getHttpServer())
			.patch(`/api/v1/patient/reminders/${medicationReminder.reminderId}`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({ reminder_time: '07:30', custom_days: [1, 3, 5] })
			.expect(200);

		expect(updatedMedicationReminder.body.reminder).toMatchObject({
			reminderId: medicationReminder.reminderId,
			reminderTime: '07:30:00',
			customDays: [1, 3, 5],
			isActive: true,
		});

		const resetMedicationReminder = await request(app.getHttpServer())
			.patch(`/api/v1/patient/reminders/${medicationReminder.reminderId}`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({ reminderTime: '06:15:00', customDays: null })
			.expect(200);

		expect(resetMedicationReminder.body.reminder).toMatchObject({
			reminderId: medicationReminder.reminderId,
			reminderTime: '06:15:00',
			customDays: null,
		});

		await request(app.getHttpServer())
			.patch(`/api/v1/patient/reminders/${appointmentReminder.reminderId}`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({ reminder_time: '10:00' })
			.expect(400);

		await request(app.getHttpServer())
			.patch(`/api/v1/patient/reminders/${orderReminder.reminderId}`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({ custom_days: [2, 4] })
			.expect(400);

		await request(app.getHttpServer())
			.patch(`/api/v1/patient/reminders/${medicationReminder.reminderId}`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({ is_active: false })
			.expect(400);

		await request(app.getHttpServer())
			.patch(`/api/v1/patient/reminders/${appointmentReminder.reminderId}`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({ is_active: false })
			.expect(400);

		await request(app.getHttpServer())
			.patch(`/api/v1/patient/reminders/${orderReminder.reminderId}`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({ is_active: true })
			.expect(400);

		await request(app.getHttpServer())
			.patch(`/api/v1/patient/reminders/${medicationReminder.reminderId}`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({ reminder_time: '25:00' })
			.expect(400);

		await request(app.getHttpServer())
			.patch(`/api/v1/patient/reminders/${medicationReminder.reminderId}`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({ custom_days: [0] })
			.expect(400);

		const dismissedOrderReminder = await request(app.getHttpServer())
			.patch(`/api/v1/patient/reminders/${orderReminder.reminderId}`)
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({ is_active: false })
			.expect(200);

		expect(dismissedOrderReminder.body.reminder).toMatchObject({
			reminderId: orderReminder.reminderId,
			isActive: false,
		});
		expect(dismissedOrderReminder.body.reminder.dismissedAt).toBeTruthy();

		const activeAfterDismissal = await request(app.getHttpServer())
			.get('/api/v1/patient/reminders')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(activeAfterDismissal.body.reminders).toHaveLength(6);
		expect(activeAfterDismissal.body.grouped.medicalOrders).toHaveLength(3);
		expect(
			activeAfterDismissal.body.reminders.some(
				(reminder: { reminderId: string }) =>
					reminder.reminderId === orderReminder.reminderId,
			),
		).toBe(false);
	});

	it('protects reminders from cross-patient access', async () => {
		const remindersResponse = await request(app.getHttpServer())
			.get('/api/v1/patient/reminders')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);
		const reminderId = remindersResponse.body.reminders[0].reminderId;

		const otherPatientReminders = await request(app.getHttpServer())
			.get('/api/v1/patient/reminders')
			.set('Authorization', `Bearer ${otherPatientJwt}`)
			.expect(200);

		expect(otherPatientReminders.body.reminders).toHaveLength(0);

		await request(app.getHttpServer())
			.patch(`/api/v1/patient/reminders/${reminderId}`)
			.set('Authorization', `Bearer ${otherPatientJwt}`)
			.send({ reminder_time: '08:00' })
			.expect(404);
	});

	it('polls pending notifications once, preserves future notifications, and marks read notifications', async () => {
		const futureNotification = await db.query(
			`
				INSERT INTO notifications
					(user_id, notification_type, status, title, message, scheduled_for)
				VALUES ($1, 'SYSTEM', 'PENDING', 'Future Notice', 'This should not be delivered yet.', NOW() + INTERVAL '1 day')
				RETURNING id
			`,
			[PATIENT_USER_ID],
		);

		const pendingResponse = await request(app.getHttpServer())
			.get('/api/v1/patient/notifications/pending')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(pendingResponse.body.notifications).toHaveLength(4);
		expect(pendingResponse.body.notifications).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					notificationType: 'SYSTEM',
					status: 'SENT',
					title: 'Account Access',
				}),
				expect.objectContaining({
					notificationType: 'SYSTEM',
					status: 'SENT',
					title: 'New Encounter Added',
				}),
				expect.objectContaining({
					notificationType: 'REMINDER',
					status: 'SENT',
					title: 'Upcoming Appointment',
				}),
				expect.objectContaining({
					notificationType: 'REMINDER',
					status: 'SENT',
					title: 'Appointment Soon',
				}),
			]),
		);
		expect(
			pendingResponse.body.notifications.some(
				(notification: { notificationId: string }) =>
					notification.notificationId === futureNotification.rows[0].id,
			),
		).toBe(false);

		const secondPendingResponse = await request(app.getHttpServer())
			.get('/api/v1/patient/notifications/pending')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(secondPendingResponse.body.notifications).toHaveLength(0);

		const notificationStatuses = await db.query(
			`
				SELECT status, COUNT(*)::INT AS total
				FROM notifications
				WHERE user_id = $1
				GROUP BY status
			`,
			[PATIENT_USER_ID],
		);
		expect(notificationStatuses.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ status: 'SENT', total: 4 }),
				expect.objectContaining({ status: 'PENDING', total: 1 }),
			]),
		);

		const readResponse = await request(app.getHttpServer())
			.patch(
				`/api/v1/patient/notifications/${pendingResponse.body.notifications[0].notificationId}/read`,
			)
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(readResponse.body.notification).toMatchObject({
			notificationId: pendingResponse.body.notifications[0].notificationId,
			status: 'READ',
		});
		expect(readResponse.body.notification.readAt).toBeTruthy();

		const historyResponse = await request(app.getHttpServer())
			.get('/api/v1/patient/notifications')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);

		expect(historyResponse.body.notifications).toHaveLength(5);
		expect(historyResponse.body.notifications).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					notificationId: futureNotification.rows[0].id,
					status: 'PENDING',
					title: 'Future Notice',
				}),
				expect.objectContaining({
					notificationId: pendingResponse.body.notifications[0].notificationId,
					status: 'READ',
				}),
			]),
		);
	});

	it('protects notifications from cross-patient access and missing ids', async () => {
		const historyResponse = await request(app.getHttpServer())
			.get('/api/v1/patient/notifications')
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(200);
		const notificationId = historyResponse.body.notifications[0].notificationId;

		const otherPatientHistory = await request(app.getHttpServer())
			.get('/api/v1/patient/notifications')
			.set('Authorization', `Bearer ${otherPatientJwt}`)
			.expect(200);
		const otherPatientPending = await request(app.getHttpServer())
			.get('/api/v1/patient/notifications/pending')
			.set('Authorization', `Bearer ${otherPatientJwt}`)
			.expect(200);

		expect(otherPatientHistory.body.notifications).toHaveLength(0);
		expect(otherPatientPending.body.notifications).toHaveLength(0);

		await request(app.getHttpServer())
			.patch(`/api/v1/patient/notifications/${notificationId}/read`)
			.set('Authorization', `Bearer ${otherPatientJwt}`)
			.expect(404);

		await request(app.getHttpServer())
			.patch(
				'/api/v1/patient/notifications/00000000-0000-0000-0000-000000000000/read',
			)
			.set('Authorization', `Bearer ${patientJwt}`)
			.expect(404);
	});

	it('rejects invalid diagnosis references and rolls the encounter transaction back', async () => {
		const beforeCounts = await db.query(
			`
				SELECT
					(SELECT COUNT(*)::INT FROM clinical_encounters WHERE patient_id = $1) AS encounters,
					(SELECT COUNT(*)::INT FROM diagnoses WHERE patient_id = $1) AS diagnoses
			`,
			[PATIENT_ID],
		);

		const failedResponse = await request(app.getHttpServer())
			.post(`/api/v1/clinical/sessions/${sessionId}/encounters`)
			.set('Authorization', `Bearer ${clinicalSessionToken}`)
			.send({
				locationAddress: 'Rollback Clinic',
				symptoms: [{ title: 'Dizziness' }],
				diagnoses: [
					{
						icd11Code: '1A00',
						icd11Title: 'Test diagnosis',
					},
				],
				medications: [
					{
						medicationName: 'Test medication',
						dosageAmount: 1,
						dosageUnit: 'TABLETS',
						form: 'TABLET',
						frequency: 'Once daily',
						startDate: '2026-04-18',
						diagnosisIndex: 3,
					},
				],
			})
			.expect(400);

		expect(failedResponse.body.message).toContain(
			'medications.diagnosisIndex 3 does not reference a valid diagnosis.',
		);

		const afterCounts = await db.query(
			`
				SELECT
					(SELECT COUNT(*)::INT FROM clinical_encounters WHERE patient_id = $1) AS encounters,
					(SELECT COUNT(*)::INT FROM diagnoses WHERE patient_id = $1) AS diagnoses
			`,
			[PATIENT_ID],
		);

		expect(afterCounts.rows[0]).toEqual(beforeCounts.rows[0]);
	});

	it('blocks write operations for read-only clinical sessions while keeping read access intact', async () => {
		const tokenResponse = await request(app.getHttpServer())
			.post('/api/v1/clinical/permission-tokens')
			.set('Authorization', `Bearer ${patientJwt}`)
			.send({
				entityType: 'HEALTHCARE_PROVIDER',
				accessType: 'READ_ONLY',
				expiresInMinutes: 30,
			})
			.expect(201);

		const readOnlySessionResponse = await request(app.getHttpServer())
			.post('/api/v1/clinical/sessions')
			.set('Authorization', `Bearer ${hcpJwt}`)
			.send({ code: tokenResponse.body.code })
			.expect(201);

		const readOnlySessionId = readOnlySessionResponse.body.sessionId;
		const readOnlyToken = readOnlySessionResponse.body.clinicalSessionToken;

		await request(app.getHttpServer())
			.get(`/api/v1/clinical/sessions/${readOnlySessionId}/medical-history`)
			.set('Authorization', `Bearer ${readOnlyToken}`)
			.query({ page: 1, limit: 10 })
			.expect(200);

		await request(app.getHttpServer())
			.patch(`/api/v1/clinical/sessions/${readOnlySessionId}/medical-identity`)
			.set('Authorization', `Bearer ${readOnlyToken}`)
			.send({ weightKg: 71 })
			.expect(403);

		await request(app.getHttpServer())
			.post(`/api/v1/clinical/sessions/${readOnlySessionId}/encounters`)
			.set('Authorization', `Bearer ${readOnlyToken}`)
			.send({
				symptoms: [{ title: 'Should not save' }],
				diagnoses: [
					{
						icd11Code: '1A00',
						icd11Title: 'Should not save',
					},
				],
			})
			.expect(403);
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

function toIso(value: string | Date) {
	return new Date(value).toISOString();
}

function toDateOnly(value: string | Date) {
	if (typeof value === 'string') {
		return value.slice(0, 10);
	}

	return value.toISOString().slice(0, 10);
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
				($6, $7, $8, $9, $10, 'VERIFIED', TRUE),
				($11, $12, $13, $14, $15, 'VERIFIED', TRUE)
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
			OTHER_PATIENT_USER_ID,
			'other.patient@test.local',
			'+201000000003',
			'hashed-password',
			UserRole.PATIENT,
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
			VALUES ($1, $2, 'Mona', 'Samir', 'Hassan', 'FEMALE', '1991-01-10', '32109876543210', NULL, NULL, NULL)
		`,
		[OTHER_PATIENT_ID, OTHER_PATIENT_USER_ID],
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
			INSERT INTO patient_health_notes
				(
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
				)
			VALUES (
				$1,
				$2,
				$3,
				'2026-03-15',
				'IMPROVED',
				'Slept a little better last night.',
				'Calmer than last week.',
				3,
				6,
				'2026-03-15T19:00:00.000Z',
				'2026-03-15T19:00:00.000Z'
			)
		`,
		[PREVIOUS_JOURNAL_NOTE_ID, PATIENT_ID, ACUTE_DIAGNOSIS_ID],
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
			INSERT INTO medical_orders
				(id, encounter_id, patient_id, ordered_by_hcp_id, order_type, order_status, ordered_at, updated_at)
			VALUES
				($1, NULL, $2, $3, 'IMAGING', 'PENDING', '2026-04-02T09:00:00.000Z', NOW())
		`,
		[PENDING_IMAGING_ORDER_ID, PATIENT_ID, HCP_ID],
	);

	await db.query(
		`
			INSERT INTO lab_orders
				(medical_order_id, test_type_id, specimen_type_id, fasting_required, priority, clinical_indication)
			VALUES (
				$1,
				1,
				1,
				FALSE,
				'ROUTINE',
				'Rule out anaemia'
			)
		`,
		[LAB_ORDER_ID],
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
				(medical_order_id, imaging_type_id, body_part_id, contrast_used, priority, clinical_indication)
			VALUES (
				$1,
				3,
				3,
				FALSE,
				'ROUTINE',
				'Evaluate lung hyperinflation'
			)
		`,
		[IMAGING_ORDER_ID],
	);

	await db.query(
		`
			INSERT INTO imaging_orders
				(medical_order_id, imaging_type_id, body_part_id, contrast_used, priority, clinical_indication)
			VALUES (
				$1,
				1,
				3,
				FALSE,
				'URGENT',
				'Persistent cough follow-up'
			)
		`,
		[PENDING_IMAGING_ORDER_ID],
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
