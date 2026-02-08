import {
	Injectable,
	InternalServerErrorException,
	UnauthorizedException,
	ForbiddenException,
	HttpException,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import { EmailPayload, EmailService, EmailAddress } from '@email/email.service';
import {
	LoginDto,
	LoginResendOtpDto,
	LoginVerifyOtpDto,
	RefreshTokenDto,
	LogoutDto,
} from '../dto/login.dto';
import { InvalidOtpException } from '../exceptions/auth.exceptions';
import { generateOtp } from '@helpers/crypto.helper';
import { constructOtpMfaTemplate } from '@email/templates/login-otp.template';
import { LoginRepository } from '../repository/login.repository';
import { timeUntilExpiryReadable } from '@helpers/time.helper';
import * as bcrypt from 'bcrypt';
import { EmailCategory } from '@common/enums/email.enums';
import { LoginResult } from '../interfaces/login-repository.interface';
import {
	Request as ExpressRequest,
	Response as ExpressResponse,
} from 'express';
import { validate as isUuid } from 'uuid';

@Injectable()
export class LoginService {
	constructor(
		private readonly loginRepository: LoginRepository,
		private readonly emailService: EmailService,
	) {}

	async login(req: Request, body: LoginDto) {
		try {
			const otp: string = generateOtp();
			const otpHash: string = await bcrypt.hash(otp, 10);

			const ipAddress: any = req['ip'] || req['socket']?.remoteAddress;
			const userAgent: any = req.headers['user-agent'] || 'unknown';

			const loginExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
			const otpExpiresAt: Date = new Date(Date.now() + 5 * 60 * 1000);

			await this.loginRepository.invalidatePreviousTokens({
				email: body.email,
				ipAddress: ipAddress,
				userAgent: userAgent,
			});

			const dbResult: LoginResult = await this.loginRepository.login({
				email: body.email,
				password: body.password,
				ipAddress: ipAddress,
				userAgent: userAgent,
				loginExpiresAt: loginExpiresAt,
				otpHash: otpHash,
				otpExpiresAt: otpExpiresAt,
			});

			const emailAddress: EmailAddress = { email: body.email };
			const emailPayload: EmailPayload = {
				to: emailAddress,
				subject: 'Login Verification',
				text: `Your verification code is ${otp}`,
				html: constructOtpMfaTemplate(
					timeUntilExpiryReadable(otpExpiresAt),
					otp,
				),
				category: EmailCategory.AUTH,
			};
			await this.emailService.send(emailPayload);

			return {
				loginSessionId: dbResult.loginSessionId,
				otpDelivery: body.email,
				expiresAt: otpExpiresAt.toISOString(),
			};
		} catch (error) {
			if (
				error instanceof UnauthorizedException ||
				error instanceof ForbiddenException ||
				error instanceof HttpException
			) {
				throw error;
			}

			console.log('Login Error: ', error);
			throw new InternalServerErrorException('Login failed, please try again.');
		}
	}

	async loginResendOtp(req: Request, body: LoginResendOtpDto) {
		try {
			const otp: string = generateOtp();
			const otpHash: string = await bcrypt.hash(otp, 10);
			const otpExpiresAt: Date = new Date(Date.now() + 5 * 60 * 1000);

			const dbResult = await this.loginRepository.loginResendOtp({
				loginSessionId: body.loginSessionId,
				otpHash: otpHash,
				otpExpiresAt: otpExpiresAt,
			});

			const emailAddress: EmailAddress = { email: dbResult.email };
			const emailPayload: EmailPayload = {
				to: emailAddress,
				subject: 'Login Verification',
				text: `Your verification code is ${otp}`,
				html: constructOtpMfaTemplate(
					timeUntilExpiryReadable(dbResult.otpExpiresAt),
					otp,
				),
				category: EmailCategory.AUTH,
			};

			await this.emailService.send(emailPayload);

			return {
				loginSessionId: body.loginSessionId,
				otpDelivery: dbResult.email,
				expiresAt: dbResult.otpExpiresAt.toISOString(),
			};
		} catch (error) {
			if (
				error instanceof ForbiddenException ||
				error instanceof HttpException
			) {
				throw error;
			}

			console.log('Resend Login OTP Error: ', error);
			throw new InternalServerErrorException(
				'Resend OTP failed, please try again.',
			);
		}
	}

	async loginVerifyOtp(
		req: ExpressRequest,
		res: ExpressResponse,
		body: LoginVerifyOtpDto,
	) {
		try {
			const sessionData =
				await this.loginRepository.getLoginSessionForVerification(
					body.loginSessionId,
				);

			const isOtpValid = await bcrypt.compare(body.otp, sessionData.otpHash);
			if (!isOtpValid) {
				throw new InvalidOtpException();
			}

			const ipAddress: any = req['ip'] || req['socket']?.remoteAddress;
			const userAgent: any = req.headers['user-agent'] || 'unknown';

			const { userId, email, role, accessToken, refreshToken } =
				await this.loginRepository.completeLogin({
					sessionData,
					ipAddress,
					userAgent,
				});

			const response = {
				success: true,
				message: 'Login successful.',
				userId: userId,
				email: email,
				role: role,
				accessToken: accessToken,
			};

			if (body.platform === 'mobile') {
				response['refreshToken'] = refreshToken;
			} else {
				res.cookie('refreshToken', refreshToken, {
					httpOnly: true,
					secure: process.env.NODE_ENV === 'production',
					sameSite: 'strict',
					maxAge: 7 * 24 * 60 * 60 * 1000,
				});
			}

			return response;
		} catch (error) {
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException ||
				error instanceof HttpException
			) {
				throw error;
			}

			console.log('Verify Login OTP Error: ', error);
			throw new InternalServerErrorException(
				'OTP verification failed, please try again.',
			);
		}
	}

	async refresh(
		req: ExpressRequest,
		res: ExpressResponse,
		body: RefreshTokenDto,
	) {
		try {
			let refreshToken: string;

			if (body.platform === 'mobile') {
				if (!body.refreshToken) {
					throw new BadRequestException('Refresh token not found');
				}
				refreshToken = body.refreshToken;
			} else {
				refreshToken = req.cookies?.refreshToken;
				if (!refreshToken) {
					throw new UnauthorizedException('Refresh token not found');
				}
			}

			const ipAddress: any = req['ip'] || req['socket']?.remoteAddress;
			const userAgent: any = req.headers['user-agent'] || 'unknown';

			const { userId, email, role, accessToken, newRefreshToken } =
				await this.loginRepository.refresh({
					refreshToken,
					ipAddress,
					userAgent,
				});

			const response = {
				success: true,
				accessToken: accessToken,
				userId: userId,
				email: email,
				role: role,
			};

			if (body.platform === 'mobile') {
				response['refreshToken'] = newRefreshToken;
			} else {
				res.cookie('refreshToken', newRefreshToken, {
					httpOnly: true,
					secure: process.env.NODE_ENV === 'production',
					sameSite: 'strict',
					maxAge: 7 * 24 * 60 * 60 * 1000,
				});
			}

			return response;
		} catch (error) {
			if (
				error instanceof UnauthorizedException ||
				error instanceof BadRequestException ||
				error instanceof HttpException
			) {
				throw error;
			}

			console.log('Refresh Token Error: ', error);
			throw new InternalServerErrorException(
				'Token refresh failed, please try again.',
			);
		}
	}

	async logout(req: ExpressRequest, res: ExpressResponse, body: LogoutDto) {
		try {
			let refreshToken: string;

			if (body.platform === 'mobile') {
				if (!body.refreshToken) {
					throw new BadRequestException('Refresh token not found');
				}
				refreshToken = body.refreshToken;
			} else {
				refreshToken = req.cookies?.refreshToken;
				if (!refreshToken) {
					throw new UnauthorizedException('Refresh token not found');
				}
			}

			const parts = refreshToken.split('.');
			if (parts.length !== 2 || !isUuid(parts[0])) {
				throw new UnauthorizedException('Invalid refresh token');
			}

			await this.loginRepository.logout(refreshToken);

			if (body.platform === 'web') {
				res.clearCookie('refreshToken', {
					httpOnly: true,
					secure: process.env.NODE_ENV === 'production',
					sameSite: 'strict',
				});
			}

			return {
				success: true,
				message: 'Logged out successfully',
			};
		} catch (error) {
			if (error instanceof HttpException) {
				throw error;
			}

			console.log('Logout Error: ', error);
			throw new InternalServerErrorException(
				'Logout failed, please try again.',
			);
		}
	}
}
