import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '@db/database.service';
import { PoolClient } from 'pg';
import {
	RegistrationSessionData,
	OtpData,
	RegistrationResult,
	ResendOtpData,
	ResendOtpResult
} from '../interfaces/register-repository.interface';
import {
	DatabaseOperationException,
	RegistrationSessionNotFoundException,
	RegistrationSessionExpiredException
} from '../exceptions/auth.exceptions';

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

			throw new DatabaseOperationException(`Database operation failed: ${error.message}`);
		} finally {
			client.release();
		}
	}

	async registerResendOtp(resendOtpData: ResendOtpData): Promise<ResendOtpResult> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const sessionResult = await client.query(
				`SELECT email, expires_at 
				FROM registration_sessions 
				WHERE id = $1`,
				[resendOtpData.registrationSessionId]
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
				[resendOtpData.registrationSessionId]
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
				]
			);

			const otpExpiresAt = otpResult.rows[0].expires_at;

			await client.query('COMMIT');

			return {
				email: session.email,
				otpExpiresAt,
			};

		} catch (error) {
			await client.query('ROLLBACK');

			if (error instanceof RegistrationSessionNotFoundException || 
          		error instanceof RegistrationSessionExpiredException) {
        		throw error;
      		}
      		throw new DatabaseOperationException(`Database operation failed: ${error.message}`);
		} finally {
			client.release();
		}
	}
}
