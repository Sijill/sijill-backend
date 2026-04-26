import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/modules/database/database.service';
import { EmailService, type EmailPayload } from '../src/modules/email/email.service';
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
const TEST_ACCESS_SECRET = 'full-project-test-access-secret';

const SEEDED_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000001';
const SEEDED_ADMIN_EMAIL = 'admin@gmail.com';
const SEEDED_PATIENT_USER_ID = '00000000-0000-0000-0000-000000000002';
const SEEDED_PATIENT_EMAIL = 'patient@gmail.com';
const SEEDED_HCP_USER_ID = '00000000-0000-0000-0000-000000000003';
const SEEDED_HCP_EMAIL = 'hcp@gmail.com';

const SUSPENDED_PATIENT_USER_ID = 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa';
const SUSPENDED_PATIENT_ID = 'bbbbbbbb-1111-4444-8888-bbbbbbbbbbbb';
const SUSPENDED_PATIENT_EMAIL = 'suspended.patient@test.local';

const REGISTERED_PATIENT_EMAIL = 'e2e.patient@test.local';
const REGISTERED_PATIENT_PASSWORD = 'StrongPass123';
const RESET_PATIENT_PASSWORD = 'ResetPass123';
const REGISTERED_LAB_EMAIL = 'e2e.lab@test.local';
const REGISTERED_LAB_PASSWORD = 'LabPass123';
let mailbox: EmailPayload[] = [];

describe('Full Project (e2e)', () => {
	let app: INestApplication;
	let db: DatabaseService;
	let databaseName: string;
	let fixtureDir: string;
	let uploadRootDir: string;
	let originalFetch: typeof fetch | undefined;

	let registeredPatientUserId: string;
	let registeredLabUserId: string;
	let patientDocumentId: string;
	let refreshedMobileToken: string;
	let webAgent: any;

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
		process.env.ICD_API_URL = 'http://icd-test.local';
		uploadRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sijill-uploads-'));
		process.env.UPLOAD_ROOT = uploadRootDir;

		mailbox = [];
		ensureUploadDirs(uploadRootDir);
		fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sijill-e2e-'));
		createFixtureFiles(fixtureDir);
		originalFetch = global.fetch;

		const emailServiceMock = {
			send: jest.fn(async (payload: EmailPayload) => {
				mailbox.push(payload);
			}),
		};

		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(EmailService)
			.useValue(emailServiceMock)
			.compile();

		app = moduleRef.createNestApplication();
		app.use(cookieParser());
		app.useGlobalPipes(
			new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
		);
		await app.init();

		db = app.get(DatabaseService);
		await seedFullProjectTestData(db);
		webAgent = request.agent(app.getHttpServer());
	});

	afterAll(async () => {
		global.fetch = originalFetch as typeof fetch;

		if (app) {
			await app.close();
		}

		if (fixtureDir && fs.existsSync(fixtureDir)) {
			fs.rmSync(fixtureDir, { recursive: true, force: true });
		}

		if (uploadRootDir && fs.existsSync(uploadRootDir)) {
			fs.rmSync(uploadRootDir, { recursive: true, force: true });
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

	it('validates and serves ICD search results', async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: jest.fn().mockResolvedValue({
				destinationEntities: [
					{ theCode: 'CA23', title: 'Asthma' },
					{ theCode: 'CA24', title: 'Exercise-induced asthma' },
				],
			}),
		}) as typeof fetch;

		await request(app.getHttpServer())
			.get('/api/v1/icd/search')
			.query({ q: 'a' })
			.expect(400);

		const response = await request(app.getHttpServer())
			.get('/api/v1/icd/search')
			.query({ q: '  asth  ' })
			.expect(200);

		expect(response.body).toEqual([
			{ code: 'CA23', title: 'Asthma' },
			{ code: 'CA24', title: 'Exercise-induced asthma' },
		]);
	});

	it('registers a patient, resends OTP, rejects the stale OTP, and persists the pending account after verification', async () => {
		await request(app.getHttpServer())
			.post('/api/v1/auth/register')
			.field('role', UserRole.PATIENT)
			.field('email', 'missing.file@test.local')
			.field('phoneNumber', '01011111111')
			.field('password', REGISTERED_PATIENT_PASSWORD)
			.field('firstName', 'Missing')
			.field('middleName', 'File')
			.field('surName', 'Patient')
			.field('gender', 'FEMALE')
			.field('dateOfBirth', '1998-06-01')
			.field('nationalId', '29806011234567')
			.attach('nationalIdFront', path.join(fixtureDir, 'national-id-front.jpg'))
			.attach('nationalIdBack', path.join(fixtureDir, 'national-id-back.png'))
			.expect(400);

		const registerResponse = await request(app.getHttpServer())
			.post('/api/v1/auth/register')
			.field('role', UserRole.PATIENT)
			.field('email', REGISTERED_PATIENT_EMAIL)
			.field('phoneNumber', '01011111112')
			.field('password', REGISTERED_PATIENT_PASSWORD)
			.field('firstName', 'Mona')
			.field('middleName', 'Mahmoud')
			.field('surName', 'Adel')
			.field('gender', 'FEMALE')
			.field('dateOfBirth', '1997-05-17')
			.field('nationalId', '29705171234567')
			.attach('nationalIdFront', path.join(fixtureDir, 'national-id-front.jpg'))
			.attach('nationalIdBack', path.join(fixtureDir, 'national-id-back.png'))
			.attach('selfieWithId', path.join(fixtureDir, 'selfie-with-id.pdf'))
			.expect(201);

		const patientRegistrationSessionId =
			registerResponse.body.registrationSessionId;
		const initialOtp = extractOtpFromEmail(
			getLatestEmail(REGISTERED_PATIENT_EMAIL, 'Email Verification'),
		);

		await request(app.getHttpServer())
			.post('/api/v1/auth/register/resend-otp')
			.send({ registrationSessionId: patientRegistrationSessionId })
			.expect(201);

		const resentOtp = extractOtpFromEmail(
			getLatestEmail(REGISTERED_PATIENT_EMAIL, 'Email Verification'),
		);

		await request(app.getHttpServer())
			.post('/api/v1/auth/register/verify-otp')
			.send({
				registrationSessionId: patientRegistrationSessionId,
				otp: initialOtp,
			})
			.expect(400);

		const verifyResponse = await request(app.getHttpServer())
			.post('/api/v1/auth/register/verify-otp')
			.send({
				registrationSessionId: patientRegistrationSessionId,
				otp: resentOtp,
			})
			.expect(201);

		registeredPatientUserId = verifyResponse.body.userId;

		const userResult = await db.query(
			`
				SELECT id, role, account_status
				FROM users
				WHERE email = $1
			`,
			[REGISTERED_PATIENT_EMAIL],
		);
		const profileResult = await db.query(
			`
				SELECT first_name, middle_name, surname
				FROM patients
				WHERE user_id = $1
			`,
			[registeredPatientUserId],
		);
		const documentsResult = await db.query(
			`
				SELECT id, file_type
				FROM documents
				WHERE user_id = $1
				ORDER BY file_type
			`,
			[registeredPatientUserId],
		);

		expect(userResult.rows[0]).toMatchObject({
			id: registeredPatientUserId,
			role: 'PATIENT',
			account_status: 'PENDING',
		});
		expect(profileResult.rows[0]).toMatchObject({
			first_name: 'Mona',
			middle_name: 'Mahmoud',
			surname: 'Adel',
		});
		expect(documentsResult.rows.map((row) => row.file_type).sort()).toEqual([
			'NATIONAL_ID_BACK',
			'NATIONAL_ID_FRONT',
			'SELFIE_WITH_ID',
		]);

		await request(app.getHttpServer())
			.post('/api/v1/auth/login')
			.send({
				email: REGISTERED_PATIENT_EMAIL,
				password: REGISTERED_PATIENT_PASSWORD,
			})
			.expect(403);
	});

	it('registers a laboratory account through the auth flow so admin rejection is covered too', async () => {
		const registerResponse = await request(app.getHttpServer())
			.post('/api/v1/auth/register')
			.field('role', UserRole.LAB)
			.field('email', REGISTERED_LAB_EMAIL)
			.field('phoneNumber', '01011111113')
			.field('password', REGISTERED_LAB_PASSWORD)
			.field('centerName', 'Delta Lab')
			.field('centerAddress', '19 Lab Street')
			.field('registrationNumber', 'LAB-2026-01')
			.field('administratorFullName', 'Laila Hassan')
			.attach(
				'accreditationDocument',
				path.join(fixtureDir, 'accreditation-document.pdf'),
			)
			.attach(
				'proofOfAddress',
				path.join(fixtureDir, 'proof-of-address.pdf'),
			)
			.attach('labLogo', path.join(fixtureDir, 'lab-logo.png'))
			.expect(201);

		const registrationSessionId = registerResponse.body.registrationSessionId;
		const otp = extractOtpFromEmail(
			getLatestEmail(REGISTERED_LAB_EMAIL, 'Email Verification'),
		);

		const verifyResponse = await request(app.getHttpServer())
			.post('/api/v1/auth/register/verify-otp')
			.send({ registrationSessionId, otp })
			.expect(201);

		registeredLabUserId = verifyResponse.body.userId;

		const labResult = await db.query(
			`
				SELECT lab_name, registration_number
				FROM laboratories
				WHERE user_id = $1
			`,
			[registeredLabUserId],
		);

		expect(labResult.rows[0]).toMatchObject({
			lab_name: 'Delta Lab',
			registration_number: 'LAB-2026-01',
		});
	});

	it('enforces patient/admin guards and lets admin inspect the pending verification queue and documents', async () => {
		const adminToken = signAccessToken({
			userId: SEEDED_ADMIN_USER_ID,
			email: SEEDED_ADMIN_EMAIL,
			role: UserRole.ADMIN,
		});
		const patientToken = signAccessToken({
			userId: SEEDED_PATIENT_USER_ID,
			email: SEEDED_PATIENT_EMAIL,
			role: UserRole.PATIENT,
		});
		const hcpToken = signAccessToken({
			userId: SEEDED_HCP_USER_ID,
			email: SEEDED_HCP_EMAIL,
			role: UserRole.HEALTHCARE_PROVIDER,
		});
		const suspendedPatientToken = signAccessToken({
			userId: SUSPENDED_PATIENT_USER_ID,
			email: SUSPENDED_PATIENT_EMAIL,
			role: UserRole.PATIENT,
		});

		await request(app.getHttpServer()).get('/api/v1/admin/stats').expect(401);

		await request(app.getHttpServer())
			.get('/api/v1/admin/stats')
			.set('Authorization', `Bearer ${patientToken}`)
			.expect(403);

		await request(app.getHttpServer())
			.get('/api/v1/patient/medical-identity')
			.expect(401);

		await request(app.getHttpServer())
			.get('/api/v1/patient/medical-identity')
			.set('Authorization', `Bearer ${hcpToken}`)
			.expect(403);

		await request(app.getHttpServer())
			.get('/api/v1/patient/medical-identity')
			.set('Authorization', `Bearer ${suspendedPatientToken}`)
			.expect(403);

		const statsResponse = await request(app.getHttpServer())
			.get('/api/v1/admin/stats')
			.set('Authorization', `Bearer ${adminToken}`)
			.expect(200);

		expect(statsResponse.body).toMatchObject({
			patients: 3,
			healthcareProviders: 1,
			laboratories: 1,
			imagingCenters: 0,
		});

		const queueResponse = await request(app.getHttpServer())
			.get('/api/v1/admin/verification-queue')
			.set('Authorization', `Bearer ${adminToken}`)
			.query({ limit: 10 })
			.expect(200);

		expect(queueResponse.body.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: registeredPatientUserId,
					role: 'PATIENT',
				}),
				expect.objectContaining({
					id: registeredLabUserId,
					role: 'LAB',
				}),
			]),
		);

		const labOnlyResponse = await request(app.getHttpServer())
			.get('/api/v1/admin/verification-queue')
			.set('Authorization', `Bearer ${adminToken}`)
			.query({ limit: 10, role: 'LAB' })
			.expect(200);

		expect(labOnlyResponse.body.data).toEqual([
			expect.objectContaining({
				id: registeredLabUserId,
				role: 'LAB',
			}),
		]);

		const detailsResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/verification-queue/${registeredPatientUserId}`)
			.set('Authorization', `Bearer ${adminToken}`)
			.expect(200);

		expect(detailsResponse.body.user).toMatchObject({
			id: registeredPatientUserId,
			email: REGISTERED_PATIENT_EMAIL,
			role: 'PATIENT',
			account_status: 'PENDING',
		});
		expect(detailsResponse.body.roleSpecificData).toMatchObject({
			first_name: 'Mona',
			middle_name: 'Mahmoud',
			surname: 'Adel',
		});
		expect(detailsResponse.body.documents.identity).toHaveLength(3);

		const frontDocument = detailsResponse.body.documents.identity.find(
			(doc: { fileType: string }) => doc.fileType === 'NATIONAL_ID_FRONT',
		);
		expect(frontDocument.downloadUrl).toBe(
			`/api/v1/admin/verification-queue/documents/${frontDocument.id}`,
		);
		patientDocumentId = frontDocument.id;

		await request(app.getHttpServer())
			.get(`/api/v1/admin/verification-queue/documents/${patientDocumentId}`)
			.set('Authorization', `Bearer ${adminToken}`)
			.expect(200)
			.expect('Content-Type', /image\/jpeg/);
	});

	it('lets admin approve and reject pending users, then exposes correct activity counts', async () => {
		const adminToken = signAccessToken({
			userId: SEEDED_ADMIN_USER_ID,
			email: SEEDED_ADMIN_EMAIL,
			role: UserRole.ADMIN,
		});

		const approveResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/verification-queue/decision')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({
				userId: registeredPatientUserId,
				decision: 'APPROVE',
			})
			.expect(200);

		const rejectResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/verification-queue/decision')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({
				userId: registeredLabUserId,
				decision: 'REJECT',
				rejectionReason: 'Submitted accreditation documents are incomplete.',
			})
			.expect(200);

		expect(approveResponse.body.message).toContain('successfully verified');
		expect(rejectResponse.body.message).toContain('rejected');

		const approvedUser = await db.query(
			`
				SELECT account_status, verified_by
				FROM users
				WHERE id = $1
			`,
			[registeredPatientUserId],
		);
		const rejectedUser = await db.query(
			`
				SELECT account_status, rejected_by, rejection_reason
				FROM users
				WHERE id = $1
			`,
			[registeredLabUserId],
		);

		expect(approvedUser.rows[0]).toMatchObject({
			account_status: 'VERIFIED',
			verified_by: SEEDED_ADMIN_USER_ID,
		});
		expect(rejectedUser.rows[0]).toMatchObject({
			account_status: 'REJECTED',
			rejected_by: SEEDED_ADMIN_USER_ID,
			rejection_reason: 'Submitted accreditation documents are incomplete.',
		});

		const activitiesResponse = await request(app.getHttpServer())
			.get('/api/v1/admin/activities')
			.set('Authorization', `Bearer ${adminToken}`)
			.expect(200);

		expect(activitiesResponse.body).toMatchObject({
			verifiedUsers: 1,
			rejectedUsers: 1,
		});

		const queueAfterDecision = await request(app.getHttpServer())
			.get('/api/v1/admin/verification-queue')
			.set('Authorization', `Bearer ${adminToken}`)
			.query({ limit: 10 })
			.expect(200);

		expect(queueAfterDecision.body.data).toHaveLength(0);
		expect(
			mailbox.some(
				(email) =>
					getPrimaryRecipient(email) === REGISTERED_PATIENT_EMAIL &&
					email.subject === 'Your Sijill Application Has Been Approved!',
			),
		).toBe(true);
		expect(
			mailbox.some(
				(email) =>
					getPrimaryRecipient(email) === REGISTERED_LAB_EMAIL &&
					email.subject === 'Update on Your Sijill Application',
			),
		).toBe(true);
	});

	it('supports the patient mobile auth flow and keeps patient endpoints role/status protected', async () => {
		const loginResponse = await request(app.getHttpServer())
			.post('/api/v1/auth/login')
			.send({
				email: REGISTERED_PATIENT_EMAIL,
				password: REGISTERED_PATIENT_PASSWORD,
			})
			.expect(201);

		const initialOtp = extractOtpFromEmail(
			getLatestEmail(REGISTERED_PATIENT_EMAIL, 'Login Verification'),
		);

		await request(app.getHttpServer())
			.post('/api/v1/auth/login/resend-otp')
			.send({ loginSessionId: loginResponse.body.loginSessionId })
			.expect(201);

		const resentOtp = extractOtpFromEmail(
			getLatestEmail(REGISTERED_PATIENT_EMAIL, 'Login Verification'),
		);

		await request(app.getHttpServer())
			.post('/api/v1/auth/login/verify-otp')
			.send({
				loginSessionId: loginResponse.body.loginSessionId,
				otp: initialOtp,
				platform: 'mobile',
			})
			.expect(400);

		const verifyResponse = await request(app.getHttpServer())
			.post('/api/v1/auth/login/verify-otp')
			.send({
				loginSessionId: loginResponse.body.loginSessionId,
				otp: resentOtp,
				platform: 'mobile',
			})
			.expect(201);

		const mobileAccessToken = verifyResponse.body.accessToken;
		const mobileRefreshToken = verifyResponse.body.refreshToken;

		const patientIdentityResponse = await request(app.getHttpServer())
			.get('/api/v1/patient/medical-identity')
			.set('Authorization', `Bearer ${mobileAccessToken}`)
			.expect(200);

		expect(patientIdentityResponse.body.basicInfo).toMatchObject({
			age: expect.any(Number),
			gender: 'FEMALE',
			bloodType: null,
			weightKg: null,
			heightCm: null,
			bmi: null,
		});
		expect(patientIdentityResponse.body.activeDiagnoses).toEqual([]);
		expect(patientIdentityResponse.body.currentMedications).toEqual([]);
		expect(patientIdentityResponse.body.allergies).toEqual([]);
		expect(patientIdentityResponse.body.chronicConditions).toEqual([]);
		expect(patientIdentityResponse.body.emergencyContacts).toEqual([]);

		const refreshResponse = await request(app.getHttpServer())
			.post('/api/v1/auth/refresh')
			.send({
				platform: 'mobile',
				refreshToken: mobileRefreshToken,
			})
			.expect(201);

		refreshedMobileToken = refreshResponse.body.refreshToken;

		await request(app.getHttpServer())
			.post('/api/v1/auth/refresh')
			.send({
				platform: 'mobile',
				refreshToken: mobileRefreshToken,
			})
			.expect(401);

		await request(app.getHttpServer())
			.post('/api/v1/auth/logout')
			.send({
				platform: 'mobile',
				refreshToken: refreshedMobileToken,
			})
			.expect(201);

		const tokenResult = await db.query(
			`
				SELECT revoked_at
				FROM refresh_tokens
				WHERE id = $1
			`,
			[refreshedMobileToken.split('.')[0]],
		);

		expect(tokenResult.rows[0].revoked_at).not.toBeNull();
	});

	it('supports web refresh tokens via cookies, rejects rejected accounts, and resets passwords end to end', async () => {
		await request(app.getHttpServer())
			.post('/api/v1/auth/login')
			.send({
				email: REGISTERED_LAB_EMAIL,
				password: REGISTERED_LAB_PASSWORD,
			})
			.expect(403);

		const webLoginResponse = await webAgent.post('/api/v1/auth/login').send({
			email: REGISTERED_PATIENT_EMAIL,
			password: REGISTERED_PATIENT_PASSWORD,
		});

		expect(webLoginResponse.status).toBe(201);

		const webOtp = extractOtpFromEmail(
			getLatestEmail(REGISTERED_PATIENT_EMAIL, 'Login Verification'),
		);

		const webVerifyResponse = await webAgent
			.post('/api/v1/auth/login/verify-otp')
			.send({
				loginSessionId: webLoginResponse.body.loginSessionId,
				otp: webOtp,
				platform: 'web',
			});

		expect(webVerifyResponse.status).toBe(201);
		expect(webVerifyResponse.headers['set-cookie']).toEqual(
			expect.arrayContaining([expect.stringContaining('refreshToken=')]),
		);
		expect(webVerifyResponse.body.refreshToken).toBeUndefined();

		const webRefreshResponse = await webAgent
			.post('/api/v1/auth/refresh')
			.send({ platform: 'web' });

		expect(webRefreshResponse.status).toBe(201);
		expect(webRefreshResponse.headers['set-cookie']).toEqual(
			expect.arrayContaining([expect.stringContaining('refreshToken=')]),
		);

		const resetInitiateResponse = await request(app.getHttpServer())
			.post('/api/v1/auth/password-reset')
			.send({ email: REGISTERED_PATIENT_EMAIL })
			.expect(201);

		const initialResetOtp = extractOtpFromEmail(
			getLatestEmail(REGISTERED_PATIENT_EMAIL, 'Password Reset Verification'),
		);

		await request(app.getHttpServer())
			.post('/api/v1/auth/password-reset/resend-otp')
			.send({
				resetSessionId: resetInitiateResponse.body.resetSessionId,
			})
			.expect(201);

		const resentResetOtp = extractOtpFromEmail(
			getLatestEmail(REGISTERED_PATIENT_EMAIL, 'Password Reset Verification'),
		);

		await request(app.getHttpServer())
			.post('/api/v1/auth/password-reset/confirm')
			.send({
				resetSessionId: resetInitiateResponse.body.resetSessionId,
				otp: initialResetOtp,
				newPassword: RESET_PATIENT_PASSWORD,
			})
			.expect(400);

		await request(app.getHttpServer())
			.post('/api/v1/auth/password-reset/confirm')
			.send({
				resetSessionId: resetInitiateResponse.body.resetSessionId,
				otp: resentResetOtp,
				newPassword: RESET_PATIENT_PASSWORD,
			})
			.expect(201);

		const activeRefreshTokens = await db.query(
			`
				SELECT COUNT(*)::INT AS total
				FROM refresh_tokens
				WHERE user_id = $1
					AND revoked_at IS NULL
			`,
			[registeredPatientUserId],
		);

		expect(activeRefreshTokens.rows[0].total).toBe(0);

		await webAgent.post('/api/v1/auth/refresh').send({ platform: 'web' }).expect(401);

		await request(app.getHttpServer())
			.post('/api/v1/auth/login')
			.send({
				email: REGISTERED_PATIENT_EMAIL,
				password: RESET_PATIENT_PASSWORD,
			})
			.expect(201);
	});
});

function signAccessToken(payload: {
	userId: string;
	email: string;
	role: UserRole;
}) {
	return jwt.sign(payload, TEST_ACCESS_SECRET, { expiresIn: '30m' });
}

function ensureUploadDirs(root: string) {
	for (const dir of ['identity', 'clinical', 'workplace']) {
		fs.mkdirSync(path.join(root, dir), { recursive: true });
	}
}

function createFixtureFiles(directory: string) {
	fs.writeFileSync(path.join(directory, 'national-id-front.jpg'), 'fake-jpg');
	fs.writeFileSync(path.join(directory, 'national-id-back.png'), 'fake-png');
	fs.writeFileSync(path.join(directory, 'selfie-with-id.pdf'), '%PDF-1.4 fake');
	fs.writeFileSync(
		path.join(directory, 'accreditation-document.pdf'),
		'%PDF-1.4 lab accreditation',
	);
	fs.writeFileSync(
		path.join(directory, 'proof-of-address.pdf'),
		'%PDF-1.4 address proof',
	);
	fs.writeFileSync(path.join(directory, 'lab-logo.png'), 'fake-lab-logo');
}

function getPrimaryRecipient(email: EmailPayload) {
	const recipient = Array.isArray(email.to) ? email.to[0] : email.to;
	return recipient.email;
}

function getLatestEmail(recipientEmail: string, subject: string) {
	const matchingEmail = [...mailbox].reverse().find((email) => {
		return (
			getPrimaryRecipient(email) === recipientEmail && email.subject === subject
		);
	});

	if (!matchingEmail) {
		throw new Error(
			`No email found for ${recipientEmail} with subject "${subject}".`,
		);
	}

	return matchingEmail;
}

function extractOtpFromEmail(email: EmailPayload) {
	const content = `${email.text ?? ''}\n${email.html ?? ''}`;
	const match = content.match(/\b(\d{6})\b/);

	if (!match) {
		throw new Error(`No OTP found in email content for subject "${email.subject}".`);
	}

	return match[1];
}

async function seedFullProjectTestData(db: DatabaseService) {
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
					email_verified,
					mfa_method
				)
			VALUES (
				$1,
				$2,
				$3,
				$4,
				'PATIENT',
				'SUSPENDED',
				TRUE,
				'EMAIL_OTP'
			)
		`,
		[
			SUSPENDED_PATIENT_USER_ID,
			SUSPENDED_PATIENT_EMAIL,
			'01011111114',
			'$2a$12$IPvROaRu/TcY7J679mr1C.rT4bSOEUWKJt.NnvR67/IyONOiSz0rq',
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
					national_id
				)
			VALUES (
				$1,
				$2,
				'Suspended',
				'Patient',
				'Case',
				'FEMALE',
				'1990-01-01',
				'29001011234567'
			)
		`,
		[SUSPENDED_PATIENT_ID, SUSPENDED_PATIENT_USER_ID],
	);
}
