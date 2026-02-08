import { Injectable, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '@db/database.service';
import { PoolClient } from 'pg';
import { MfaMethod, AccountStatus } from '@common/enums/db.enum';
import { DatabaseOperationException } from '../exceptions/auth.exceptions';
import {
	PasswordResetInitiateData,
	PasswordResetInitiateResult,
	PasswordResetResendOtpData,
	PasswordResetResendOtpResult,
	ResetSessionWithOtp,
	PasswordResetConfirmData,
} from '../interfaces/reset-password-repository.interface';
import {
	ResetSessionExpiredException,
	ResetSessionNotFoundException,
	OtpNotFoundException,
	OtpAlreadyUsedException,
	OtpExpiredException,
} from '../exceptions/auth.exceptions';

@Injectable()
export class PasswordResetRepository {
	constructor(private readonly databaseService: DatabaseService) {}

	async passwordResetInitiate(
		data: PasswordResetInitiateData,
	): Promise<PasswordResetInitiateResult> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const userResult = await client.query(
				`SELECT id, email, account_status 
				FROM users 
				WHERE email = $1`,
				[data.email],
			);

			if (userResult.rows.length === 0) {
				throw new ForbiddenException('Invalid email');
			}

			const user = userResult.rows[0];

			if (user.account_status === AccountStatus.SUSPENDED) {
				throw new ForbiddenException(
					'Your account has been suspended. Please contact support.',
				);
			}

			if (user.account_status === AccountStatus.DEACTIVATED) {
				throw new ForbiddenException(
					'Your account has been deactivated. Please contact support.',
				);
			}

			const resetSessionResult = await client.query(
				`INSERT INTO password_reset_sessions 
				(user_id, ip_address, user_agent, expires_at)
				VALUES ($1, $2, $3, $4)
				RETURNING id, expires_at`,
				[user.id, data.ipAddress, data.userAgent, data.resetExpiresAt],
			);

			const resetSessionId = resetSessionResult.rows[0].id;

			await client.query(
				`INSERT INTO user_otps 
				(user_id, password_reset_session_id, otp_hash, mfa_method, purpose, expires_at)
				VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					user.id,
					resetSessionId,
					data.otpHash,
					MfaMethod.EMAIL_OTP,
					'Password Reset OTP',
					data.otpExpiresAt,
				],
			);

			await client.query('COMMIT');

			return {
				resetSessionId,
				otpExpiresAt: data.otpExpiresAt,
			};
		} catch (error) {
			await client.query('ROLLBACK');

			if (error instanceof ForbiddenException) {
				throw error;
			}

			throw new DatabaseOperationException(
				`Database operation failed: ${error.message}`,
			);
		} finally {
			client.release();
		}
	}

	async passwordResetResendOtp(
		resendOtpData: PasswordResetResendOtpData,
	): Promise<PasswordResetResendOtpResult> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const sessionResult = await client.query(
				`SELECT prs.user_id, prs.expires_at, u.email 
				FROM password_reset_sessions prs
				INNER JOIN users u ON u.id = prs.user_id
				WHERE prs.id = $1`,
				[resendOtpData.resetSessionId],
			);

			if (sessionResult.rows.length === 0) {
				throw new ResetSessionNotFoundException();
			}

			const session = sessionResult.rows[0];
			const sessionExpiresAt = new Date(session.expires_at);

			if (sessionExpiresAt < new Date()) {
				throw new ResetSessionExpiredException();
			}

			await client.query(
				`UPDATE user_otps 
				SET used_at = now() 
				WHERE password_reset_session_id = $1 
				AND used_at IS NULL`,
				[resendOtpData.resetSessionId],
			);

			await client.query(
				`INSERT INTO user_otps 
				(user_id, password_reset_session_id, otp_hash, mfa_method, purpose, expires_at)
				VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					session.user_id,
					resendOtpData.resetSessionId,
					resendOtpData.otpHash,
					MfaMethod.EMAIL_OTP,
					'Password Reset OTP',
					resendOtpData.otpExpiresAt,
				],
			);

			await client.query('COMMIT');

			return {
				email: session.email,
				otpExpiresAt: resendOtpData.otpExpiresAt,
			};
		} catch (error) {
			await client.query('ROLLBACK');

			if (
				error instanceof ResetSessionNotFoundException ||
				error instanceof ResetSessionExpiredException
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

	async getResetSessionForVerification(
		resetSessionId: string,
	): Promise<ResetSessionWithOtp> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			const result = await client.query(
				`SELECT 
					prs.id as session_id,
					prs.user_id,
					prs.expires_at as session_expires_at,
					u.email,
					uo.otp_hash,
					uo.expires_at as otp_expires_at,
					uo.used_at as otp_used_at
				FROM password_reset_sessions prs
				INNER JOIN users u ON u.id = prs.user_id
				INNER JOIN user_otps uo ON uo.password_reset_session_id = prs.id
				WHERE prs.id = $1 AND uo.used_at IS NULL
				ORDER BY uo.created_at DESC
				LIMIT 1`,
				[resetSessionId],
			);

			if (result.rows.length === 0) {
				throw new OtpNotFoundException();
			}

			const sessionData: ResetSessionWithOtp = {
				sessionId: result.rows[0].session_id,
				userId: result.rows[0].user_id,
				email: result.rows[0].email,
				sessionExpiresAt: new Date(result.rows[0].session_expires_at),
				otpHash: result.rows[0].otp_hash,
				otpExpiresAt: new Date(result.rows[0].otp_expires_at),
				otpUsedAt: result.rows[0].otp_used_at
					? new Date(result.rows[0].otp_used_at)
					: null,
			};

			if (sessionData.sessionExpiresAt < new Date()) {
				throw new ResetSessionExpiredException();
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
				error instanceof ResetSessionExpiredException ||
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

	async passwordResetConfirm(data: PasswordResetConfirmData): Promise<void> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const otpUpdateResult = await client.query(
				`UPDATE user_otps 
				SET used_at = now() 
				WHERE password_reset_session_id = $1 AND used_at IS NULL
				RETURNING id`,
				[data.sessionData.sessionId],
			);

			if (otpUpdateResult.rows.length === 0) {
				throw new OtpAlreadyUsedException();
			}

			await client.query(
				`UPDATE users 
				SET password_hash = $1, updated_at = now()
				WHERE id = $2`,
				[data.newPasswordHash, data.sessionData.userId],
			);

			await client.query(
				`UPDATE refresh_tokens 
				SET revoked_at = NOW()
				WHERE user_id = $1 
				AND revoked_at IS NULL`,
				[data.sessionData.userId],
			);

			await client.query('COMMIT');
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
}
