import {
	Injectable,
	UnauthorizedException,
	ForbiddenException,
	HttpException,
} from '@nestjs/common';
import { DatabaseService } from '@db/database.service';
import { PoolClient } from 'pg';
import * as bcrypt from 'bcrypt';
import { MfaMethod, AccountStatus } from '@common/enums/db.enum';
import { DatabaseOperationException } from '../exceptions/auth.exceptions';
import {
	LoginData,
	LoginResult,
	ResendLoginOtpData,
	ResendLoginOtpResult,
	LoginSessionWithOtp,
	InvalidateTokensData,
} from '../interfaces/login-repository.interface';
import {
	LoginSessionExpiredException,
	LoginSessionNotFoundException,
	OtpNotFoundException,
	OtpAlreadyUsedException,
	OtpExpiredException,
	RefreshTokenExpiredException,
	RefreshTokenRevokedException,
	InvalidRefreshTokenException,
} from '../exceptions/auth.exceptions';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { validate as isUuid } from 'uuid';

@Injectable()
export class LoginRepository {
	constructor(private readonly databaseService: DatabaseService) {}
	async login(loginData: LoginData): Promise<LoginResult> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const userResult = await client.query(
				`SELECT id, email, password_hash, role, account_status, email_verified
				FROM users 
				WHERE email = $1`,
				[loginData.email],
			);

			if (userResult.rows.length === 0) {
				throw new UnauthorizedException('Invalid email or password');
			}

			const user = userResult.rows[0];

			const isPasswordValid = await bcrypt.compare(
				loginData.password,
				user.password_hash,
			);

			if (!isPasswordValid) {
				throw new UnauthorizedException('Invalid email or password');
			}

			if (user.account_status === AccountStatus.PENDING) {
				throw new ForbiddenException(
					'Your account is pending approval. Please wait for admin verification.',
				);
			}

			if (user.account_status === AccountStatus.REJECTED) {
				throw new ForbiddenException(
					'Your registration application has been rejected. Please review the email sent to you for further details.',
				);
			}

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

			if (!user.email_verified) {
				throw new ForbiddenException(
					'Please verify your email before logging in.',
				);
			}

			const loginSessionResult = await client.query(
				`INSERT INTO login_sessions 
				(user_id, ip_address, user_agent, expires_at)
				VALUES ($1, $2, $3, $4)
				RETURNING id, expires_at`,
				[
					user.id,
					loginData.ipAddress,
					loginData.userAgent,
					loginData.loginExpiresAt,
				],
			);

			const loginSessionId = loginSessionResult.rows[0].id;

			await client.query(
				`INSERT INTO user_otps 
				(user_id, login_session_id, otp_hash, mfa_method, purpose, expires_at)
				VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					user.id,
					loginSessionId,
					loginData.otpHash,
					MfaMethod.EMAIL_OTP,
					'Login OTP',
					loginData.otpExpiresAt,
				],
			);

			await client.query('COMMIT');

			return {
				loginSessionId,
				otpExpiresAt: loginData.otpExpiresAt,
			};
		} catch (error) {
			await client.query('ROLLBACK');

			if (
				error instanceof UnauthorizedException ||
				error instanceof ForbiddenException
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

	async invalidatePreviousTokens(data: InvalidateTokensData): Promise<void> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query(
				`UPDATE refresh_tokens 
                SET revoked_at = NOW()
                WHERE user_id = (SELECT id FROM users WHERE email = $1)
                AND revoked_at IS NULL
                AND expires_at > NOW()`,
				[data.email],
			);
		} catch (error) {
			console.error('Failed to invalidate previous tokens:', error);
		} finally {
			client.release();
		}
	}

	async loginResendOtp(
		resendOtpData: ResendLoginOtpData,
	): Promise<ResendLoginOtpResult> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const sessionResult = await client.query(
				`SELECT ls.user_id, ls.expires_at, u.email 
                FROM login_sessions ls
                INNER JOIN users u ON u.id = ls.user_id
                WHERE ls.id = $1`,
				[resendOtpData.loginSessionId],
			);

			if (sessionResult.rows.length === 0) {
				throw new LoginSessionNotFoundException();
			}

			const session = sessionResult.rows[0];
			const sessionExpiresAt = new Date(session.expires_at);

			if (sessionExpiresAt < new Date()) {
				throw new LoginSessionExpiredException();
			}

			await client.query(
				`UPDATE user_otps 
                SET used_at = now() 
                WHERE login_session_id = $1 
                AND used_at IS NULL`,
				[resendOtpData.loginSessionId],
			);

			await client.query(
				`INSERT INTO user_otps 
                (user_id, login_session_id, otp_hash, mfa_method, purpose, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					session.user_id,
					resendOtpData.loginSessionId,
					resendOtpData.otpHash,
					MfaMethod.EMAIL_OTP,
					'Login OTP',
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
				error instanceof LoginSessionNotFoundException ||
				error instanceof LoginSessionExpiredException
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

	async getLoginSessionForVerification(
		loginSessionId: string,
	): Promise<LoginSessionWithOtp> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			const result = await client.query(
				`SELECT 
                    ls.id as session_id,
                    ls.user_id,
                    ls.expires_at as session_expires_at,
                    u.email,
                    u.role,
                    uo.otp_hash,
                    uo.expires_at as otp_expires_at,
                    uo.used_at as otp_used_at
                FROM login_sessions ls
                INNER JOIN users u ON u.id = ls.user_id
                INNER JOIN user_otps uo ON uo.login_session_id = ls.id
                WHERE ls.id = $1 AND uo.used_at IS NULL
                ORDER BY uo.created_at DESC
                LIMIT 1`,
				[loginSessionId],
			);

			if (result.rows.length === 0) {
				throw new OtpNotFoundException();
			}

			const sessionData: LoginSessionWithOtp = {
				sessionId: result.rows[0].session_id,
				userId: result.rows[0].user_id,
				email: result.rows[0].email,
				role: result.rows[0].role,
				sessionExpiresAt: new Date(result.rows[0].session_expires_at),
				otpHash: result.rows[0].otp_hash,
				otpExpiresAt: new Date(result.rows[0].otp_expires_at),
				otpUsedAt: result.rows[0].otp_used_at
					? new Date(result.rows[0].otp_used_at)
					: null,
			};

			if (sessionData.sessionExpiresAt < new Date()) {
				throw new LoginSessionExpiredException();
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
				error instanceof LoginSessionExpiredException ||
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

	async completeLogin(data: {
		sessionData: LoginSessionWithOtp;
		ipAddress: string;
		userAgent: string;
	}): Promise<{
		userId: string;
		email: string;
		role: string;
		accessToken: string;
		refreshToken: string;
	}> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const otpUpdateResult = await client.query(
				`UPDATE user_otps 
                SET used_at = now() 
                WHERE login_session_id = $1 AND used_at IS NULL
                RETURNING id`,
				[data.sessionData.sessionId],
			);

			if (otpUpdateResult.rows.length === 0) {
				throw new OtpAlreadyUsedException();
			}

			await client.query(
				`UPDATE users 
                SET last_login_at = now(), last_login_ip = $2
                WHERE id = $1`,
				[data.sessionData.userId, data.ipAddress],
			);

			const accessToken = jwt.sign(
				{
					userId: data.sessionData.userId,
					email: data.sessionData.email,
					role: data.sessionData.role,
				},
				process.env.JWT_ACCESS_SECRET as string,
				{ expiresIn: '15m' },
			);

			const refreshToken = crypto.randomBytes(32).toString('hex');
			const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
			const refreshTokenExpiresAt = new Date(
				Date.now() + 7 * 24 * 60 * 60 * 1000,
			);

			const refreshTokenResult = await client.query(
				`INSERT INTO refresh_tokens 
                (user_id, token_hash, expires_at, issued_ip, user_agent)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id`,
				[
					data.sessionData.userId,
					refreshTokenHash,
					refreshTokenExpiresAt,
					data.ipAddress,
					data.userAgent,
				],
			);

			const refreshTokenId = refreshTokenResult.rows[0].id;

			await client.query('COMMIT');

			return {
				userId: data.sessionData.userId,
				email: data.sessionData.email,
				role: data.sessionData.role,
				accessToken: accessToken,
				refreshToken: `${refreshTokenId}.${refreshToken}`,
			};
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

	async refresh(data: {
		refreshToken: string;
		ipAddress: string;
		userAgent: string;
	}): Promise<{
		userId: string;
		email: string;
		role: string;
		accessToken: string;
		newRefreshToken: string;
	}> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			const tokenParts = data.refreshToken.split('.');
			if (tokenParts.length !== 2) {
				throw new InvalidRefreshTokenException();
			}

			const tokenId = tokenParts[0];
			const tokenValue = tokenParts[1];

			const tokenResult = await client.query(
				`SELECT rt.id, rt.user_id, rt.token_hash, rt.expires_at, rt.revoked_at,
                u.email, u.role
                FROM refresh_tokens rt
                INNER JOIN users u ON u.id = rt.user_id
                WHERE rt.id = $1`,
				[tokenId],
			);

			if (tokenResult.rows.length === 0) {
				throw new InvalidRefreshTokenException();
			}

			const token = tokenResult.rows[0];

			if (token.revoked_at !== null) {
				throw new RefreshTokenRevokedException();
			}

			const tokenExpiresAt = new Date(token.expires_at);
			if (tokenExpiresAt < new Date()) {
				throw new RefreshTokenExpiredException();
			}

			const isTokenValid = await bcrypt.compare(tokenValue, token.token_hash);
			if (!isTokenValid) {
				throw new InvalidRefreshTokenException();
			}

			const accessToken = jwt.sign(
				{
					userId: token.user_id,
					email: token.email,
					role: token.role,
				},
				process.env.JWT_ACCESS_SECRET as string,
				{ expiresIn: '15m' },
			);

			await client.query(
				`UPDATE refresh_tokens 
                SET revoked_at = now() 
                WHERE id = $1`,
				[tokenId],
			);

			const newRefreshToken = crypto.randomBytes(32).toString('hex');
			const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
			const newRefreshTokenExpiresAt = new Date(
				Date.now() + 7 * 24 * 60 * 60 * 1000,
			);

			const newTokenResult = await client.query(
				`INSERT INTO refresh_tokens 
                (user_id, token_hash, expires_at, issued_ip, user_agent)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id`,
				[
					token.user_id,
					newRefreshTokenHash,
					newRefreshTokenExpiresAt,
					data.ipAddress,
					data.userAgent,
				],
			);

			const newRefreshTokenId = newTokenResult.rows[0].id;

			await client.query('COMMIT');

			return {
				userId: token.user_id,
				email: token.email,
				role: token.role,
				accessToken: accessToken,
				newRefreshToken: `${newRefreshTokenId}.${newRefreshToken}`,
			};
		} catch (error) {
			await client.query('ROLLBACK');

			if (
				error instanceof InvalidRefreshTokenException ||
				error instanceof RefreshTokenRevokedException ||
				error instanceof RefreshTokenExpiredException
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

	async logout(refreshToken: string): Promise<void> {
		const client: PoolClient = await this.databaseService.getClient();

		try {
			const parts = refreshToken.split('.');
			if (parts.length !== 2) {
				throw new InvalidRefreshTokenException();
			}

			const tokenId = parts[0];
			const tokenValue = parts[1];

			if (!isUuid(tokenId)) {
				throw new InvalidRefreshTokenException();
			}

			const result = await client.query(
				`SELECT token_hash, revoked_at, expires_at
				FROM refresh_tokens
				WHERE id = $1`,
				[tokenId],
			);

			if (result.rows.length === 0) {
				throw new InvalidRefreshTokenException();
			}

			const token = result.rows[0];

			const isValid = await bcrypt.compare(tokenValue, token.token_hash);
			if (!isValid) {
				throw new InvalidRefreshTokenException();
			}

			await client.query(
				`UPDATE refresh_tokens
				SET revoked_at = NOW()
				WHERE id = $1`,
				[tokenId],
			);
		} catch (error) {
			if (error instanceof HttpException) {
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
