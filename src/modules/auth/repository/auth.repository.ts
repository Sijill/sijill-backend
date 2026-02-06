import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '@db/database.service';
import { PoolClient } from 'pg';
import {
	RegistrationSessionData,
	OtpData,
	RegistrationResult,
	ResendOtpData,
	ResendOtpResult,
	RegistrationSessionWithOtp,
} from '../interfaces/register-repository.interface';
import {
	DatabaseOperationException,
	RegistrationSessionNotFoundException,
	RegistrationSessionExpiredException,
	OtpNotFoundException,
	OtpAlreadyUsedException,
	OtpExpiredException,
} from '../exceptions/auth.exceptions';
import { FileType, AccountStatus, MfaMethod } from '@common/enums/db.enum';

@Injectable()
export class AuthRepository {
	constructor(private readonly databaseService: DatabaseService) {}

	async register(
		registrationData: RegistrationSessionData,
		otpData: Omit<OtpData, 'registerSessionId'>,
	): Promise<RegistrationResult> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const regResult = await client.query(
				`INSERT INTO registration_sessions 
                 (email, password_hash, role, registration_data, registration_documents, 
                  ip_address, user_agent, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id, expires_at`,
				[
					registrationData.email,
					registrationData.passwordHash,
					registrationData.role,
					registrationData.registrationData,
					registrationData.registrationDocuments,
					registrationData.ipAddress,
					registrationData.userAgent,
					registrationData.expiresAt,
				],
			);

			const registrationSessionId = regResult.rows[0].id;
			const registrationExpiresAt = regResult.rows[0].expires_at;

			const otpResult = await client.query(
				`INSERT INTO user_otps 
                 (register_session_id, otp_hash, mfa_method, purpose, expires_at)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING expires_at`,
				[
					registrationSessionId,
					otpData.otpHash,
					otpData.mfaMethod,
					otpData.purpose,
					otpData.expiresAt,
				],
			);

			const otpExpiresAt = otpResult.rows[0].expires_at;

			await client.query('COMMIT');

			return {
				registrationSessionId,
				registrationExpiresAt,
				otpExpiresAt,
			};
		} catch (error) {
			await client.query('ROLLBACK');

			if (error.code === '23505') {
				throw new BadRequestException('Email already exists');
			}

			throw new DatabaseOperationException(
				`Database operation failed: ${error.message}`,
			);
		} finally {
			client.release();
		}
	}

	async registerResendOtp(
		resendOtpData: ResendOtpData,
	): Promise<ResendOtpResult> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const sessionResult = await client.query(
				`SELECT email, expires_at 
				FROM registration_sessions 
				WHERE id = $1`,
				[resendOtpData.registrationSessionId],
			);

			if (sessionResult.rows.length === 0) {
				throw new RegistrationSessionNotFoundException();
			}

			const session = sessionResult.rows[0];
			const sessionExpiresAt = new Date(session.expires_at);

			if (sessionExpiresAt < new Date()) {
				throw new RegistrationSessionExpiredException();
			}

			await client.query(
				`UPDATE user_otps 
				SET used_at = now() 
				WHERE register_session_id = $1 
				AND used_at IS NULL`,
				[resendOtpData.registrationSessionId],
			);

			const otpResult = await client.query(
				`INSERT INTO user_otps 
				(register_session_id, otp_hash, mfa_method, purpose, expires_at)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING expires_at`,
				[
					resendOtpData.registrationSessionId,
					resendOtpData.otpHash,
					resendOtpData.mfaMethod,
					resendOtpData.purpose,
					resendOtpData.expiresAt,
				],
			);

			const otpExpiresAt = otpResult.rows[0].expires_at;

			await client.query('COMMIT');

			return {
				email: session.email,
				otpExpiresAt,
			};
		} catch (error) {
			await client.query('ROLLBACK');

			if (
				error instanceof RegistrationSessionNotFoundException ||
				error instanceof RegistrationSessionExpiredException
			) {
				throw error;
			}
			throw new DatabaseOperationException(
				`Database operation failed: ${error.message}`,
			);
		} finally {
			client.release();
		}
	}

	async getRegistrationSessionForVerification(
		registrationSessionId: string,
	): Promise<RegistrationSessionWithOtp> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			const result = await client.query(
				`SELECT 
					rs.id as session_id,
					rs.email,
					rs.password_hash,
					rs.role,
					rs.registration_data,
					rs.registration_documents,
					rs.expires_at as session_expires_at,
					uo.otp_hash,
					uo.expires_at as otp_expires_at,
					uo.used_at as otp_used_at
				FROM registration_sessions rs
				INNER JOIN user_otps uo ON uo.register_session_id = rs.id
				WHERE rs.id = $1 AND uo.used_at IS NULL
				ORDER BY uo.created_at DESC
				LIMIT 1`,
				[registrationSessionId],
			);

			if (result.rows.length === 0) {
				throw new OtpNotFoundException();
			}

			const sessionData: RegistrationSessionWithOtp = {
				sessionId: result.rows[0].session_id,
				email: result.rows[0].email,
				passwordHash: result.rows[0].password_hash,
				role: result.rows[0].role,
				registrationData: result.rows[0].registration_data,
				registrationDocuments: result.rows[0].registration_documents,
				sessionExpiresAt: new Date(result.rows[0].session_expires_at),
				otpHash: result.rows[0].otp_hash,
				otpExpiresAt: new Date(result.rows[0].otp_expires_at),
				otpUsedAt: result.rows[0].otp_used_at
					? new Date(result.rows[0].otp_used_at)
					: null,
			};

			if (sessionData.sessionExpiresAt < new Date()) {
				throw new RegistrationSessionExpiredException();
			}

			if (sessionData.otpUsedAt !== null) {
				throw new OtpAlreadyUsedException();
			}

			if (sessionData.otpExpiresAt < new Date()) {
				throw new OtpExpiredException();
			}

			return sessionData;
		} catch (error) {
			if (
				error instanceof OtpNotFoundException ||
				error instanceof RegistrationSessionExpiredException ||
				error instanceof OtpAlreadyUsedException ||
				error instanceof OtpExpiredException
			) {
				throw error;
			}

			throw new DatabaseOperationException(
				`Database operation failed: ${error.message}`,
			);
		} finally {
			client.release();
		}
	}

	async completeRegistration(
		sessionData: RegistrationSessionWithOtp,
	): Promise<{ userId: string }> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const otpUpdateResult = await client.query(
				`UPDATE user_otps 
				SET used_at = now() 
				WHERE register_session_id = $1 AND used_at IS NULL
				RETURNING id`,
				[sessionData.sessionId],
			);

			if (otpUpdateResult.rows.length === 0) {
				throw new OtpAlreadyUsedException();
			}

			const userResult = await client.query(
				`INSERT INTO users (email, phone_number, password_hash, role, account_status, email_verified, mfa_method)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				RETURNING id`,
				[
					sessionData.email,
					sessionData.registrationData.phoneNumber,
					sessionData.passwordHash,
					sessionData.role,
					AccountStatus.PENDING,
					true,
					MfaMethod.EMAIL_OTP,
				],
			);

			const userId = userResult.rows[0].id;

			await this.storeRegistrationDocuments(
				client,
				userId,
				sessionData.role,
				sessionData.registrationDocuments,
			);

			switch (sessionData.role) {
				case 'PATIENT':
					await client.query(
						`INSERT INTO patients (user_id, first_name, middle_name, surname, gender, date_of_birth, national_id)
						VALUES ($1, $2, $3, $4, $5, $6, $7)`,
						[
							userId,
							sessionData.registrationData.firstName,
							sessionData.registrationData.middleName,
							sessionData.registrationData.surName,
							sessionData.registrationData.gender,
							sessionData.registrationData.dateOfBirth,
							sessionData.registrationData.nationalId,
						],
					);
					break;

				case 'HEALTHCARE_PROVIDER':
					await client.query(
						`INSERT INTO healthcare_providers 
						(user_id, first_name, middle_name, surname, gender, date_of_birth, national_id, 
						medical_license_number, specialization, workplace_name, workplace_address)
						VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
						[
							userId,
							sessionData.registrationData.firstName,
							sessionData.registrationData.middleName,
							sessionData.registrationData.surName,
							sessionData.registrationData.gender,
							sessionData.registrationData.dateOfBirth,
							sessionData.registrationData.nationalId,
							sessionData.registrationData.medicalLicenseNumber,
							sessionData.registrationData.specialization,
							sessionData.registrationData.workplaceName,
							sessionData.registrationData.workplaceAddress,
						],
					);
					break;

				case 'LAB':
					await client.query(
						`INSERT INTO laboratories (user_id, lab_name, registration_number, administrator_full_name, lab_address)
						VALUES ($1, $2, $3, $4, $5)`,
						[
							userId,
							sessionData.registrationData.centerName,
							sessionData.registrationData.registrationNumber,
							sessionData.registrationData.administratorFullName,
							sessionData.registrationData.centerAddress,
						],
					);
					break;

				case 'IMAGING_CENTER':
					await client.query(
						`INSERT INTO imaging_centers (user_id, center_name, registration_number, administrator_full_name, center_address)
						VALUES ($1, $2, $3, $4, $5)`,
						[
							userId,
							sessionData.registrationData.centerName,
							sessionData.registrationData.registrationNumber,
							sessionData.registrationData.administratorFullName,
							sessionData.registrationData.centerAddress,
						],
					);
					break;

				default:
					throw new DatabaseOperationException(
						`Unknown role: ${sessionData.role}`,
					);
			}

			await client.query('COMMIT');

			return { userId };
		} catch (error) {
			await client.query('ROLLBACK');

			if (error instanceof OtpAlreadyUsedException) {
				throw error;
			}

			throw new DatabaseOperationException(
				`Database operation failed: ${error.message}`,
			);
		} finally {
			client.release();
		}
	}

	private async storeRegistrationDocuments(
		client: PoolClient,
		userId: string,
		role: string,
		registrationDocuments: any,
	): Promise<void> {
		try {
			const insertDocument = async (
				fieldName: string,
				fileType: FileType,
				file: any,
			): Promise<void> => {
				if (!file) return;

				await client.query(
					`INSERT INTO documents 
					(user_id, file_type, file_name, mime_type, file_path, file_size_bytes, uploaded_at)
					VALUES ($1, $2, $3, $4, $5, $6, $7)`,
					[
						userId,
						fileType,
						file.filename,
						file.mimetype,
						file.path,
						file.size,
						new Date(),
					],
				);
			};

			let files = registrationDocuments;

			if (typeof files === 'string') {
				files = JSON.parse(files);
			}

			switch (role) {
				case 'PATIENT':
					if (files?.nationalIdFront?.[0]) {
						await insertDocument(
							'nationalIdFront',
							FileType.NATIONAL_ID_FRONT,
							files.nationalIdFront[0],
						);
					}
					if (files?.nationalIdBack?.[0]) {
						await insertDocument(
							'nationalIdBack',
							FileType.NATIONAL_ID_BACK,
							files.nationalIdBack[0],
						);
					}
					if (files?.selfieWithId?.[0]) {
						await insertDocument(
							'selfieWithId',
							FileType.SELFIE_WITH_ID,
							files.selfieWithId[0],
						);
					}
					break;

				case 'HEALTHCARE_PROVIDER':
					if (files?.nationalIdFront?.[0]) {
						await insertDocument(
							'nationalIdFront',
							FileType.NATIONAL_ID_FRONT,
							files.nationalIdFront[0],
						);
					}
					if (files?.nationalIdBack?.[0]) {
						await insertDocument(
							'nationalIdBack',
							FileType.NATIONAL_ID_BACK,
							files.nationalIdBack[0],
						);
					}
					if (files?.medicalLicenseDocument?.[0]) {
						await insertDocument(
							'medicalLicenseDocument',
							FileType.MEDICAL_LICENSE,
							files.medicalLicenseDocument[0],
						);
					}
					if (files?.workplaceDocument?.[0]) {
						await insertDocument(
							'workplaceDocument',
							FileType.WORKPLACE_DOC,
							files.workplaceDocument[0],
						);
					}

					if (files?.workplaceLogo?.[0]) {
						await insertDocument(
							'workplaceLogo',
							FileType.LOGO,
							files.workplaceLogo[0],
						);
					}
					break;

				case 'LAB':
					if (files?.accreditationDocument?.[0]) {
						await insertDocument(
							'accreditationDocument',
							FileType.LAB_ACCREDITATION,
							files.accreditationDocument[0],
						);
					}
					if (files?.proofOfAddress?.[0]) {
						await insertDocument(
							'proofOfAddress',
							FileType.WORKPLACE_DOC,
							files.proofOfAddress[0],
						);
					}

					if (files?.labLogo?.[0]) {
						await insertDocument('labLogo', FileType.LOGO, files.labLogo[0]);
					}
					break;

				case 'IMAGING_CENTER':
					if (files?.accreditationDocument?.[0]) {
						await insertDocument(
							'accreditationDocument',
							FileType.RADIOLOGY_ACCREDITATION,
							files.accreditationDocument[0],
						);
					}
					if (files?.proofOfAddress?.[0]) {
						await insertDocument(
							'proofOfAddress',
							FileType.WORKPLACE_DOC,
							files.proofOfAddress[0],
						);
					}

					if (files?.centerLogo?.[0]) {
						await insertDocument(
							'centerLogo',
							FileType.LOGO,
							files.centerLogo[0],
						);
					}
					break;
			}
		} catch (error) {
			console.error('Error storing registration documents:', error);
			throw new DatabaseOperationException(
				`Failed to store registration documents: ${error.message}`,
			);
		}
	}
}
