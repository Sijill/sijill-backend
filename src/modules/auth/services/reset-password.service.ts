import {
	Injectable,
	InternalServerErrorException,
	ForbiddenException,
	HttpException,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import { EmailPayload, EmailService, EmailAddress } from '@email/email.service';
import {
	PasswordResetInitiateDto,
	PasswordResetResendOtpDto,
	PasswordResetConfirmDto,
} from '../dto/reset-password.dto';
import { InvalidOtpException } from '../exceptions/auth.exceptions';
import { generateOtp } from '@helpers/crypto.helper';
import { constructOtpPasswordResetTemplate } from '@email/templates/password-reset-otp.template';
import { PasswordResetRepository } from '../repository/reset-password.repository';
import { timeUntilExpiryReadable } from '@helpers/time.helper';
import * as bcrypt from 'bcrypt';
import { EmailCategory } from '@common/enums/email.enums';
import { PasswordResetInitiateResult } from '../interfaces/reset-password-repository.interface';

@Injectable()
export class PasswordResetService {
	constructor(
		private readonly passwordResetRepository: PasswordResetRepository,
		private readonly emailService: EmailService,
	) {}

	async passwordResetInitiate(req: Request, body: PasswordResetInitiateDto) {
		try {
			const otp: string = generateOtp();
			const otpHash: string = await bcrypt.hash(otp, 10);

			const ipAddress: any = req['ip'] || req['socket']?.remoteAddress;
			const userAgent: any = req.headers['user-agent'] || 'unknown';

			const resetExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
			const otpExpiresAt: Date = new Date(Date.now() + 5 * 60 * 1000);

			const dbResult: PasswordResetInitiateResult =
				await this.passwordResetRepository.passwordResetInitiate({
					email: body.email,
					ipAddress: ipAddress,
					userAgent: userAgent,
					resetExpiresAt: resetExpiresAt,
					otpHash: otpHash,
					otpExpiresAt: otpExpiresAt,
				});

			const emailAddress: EmailAddress = { email: body.email };
			const emailPayload: EmailPayload = {
				to: emailAddress,
				subject: 'Password Reset Verification',
				text: `Your password reset verification code is ${otp}`,
				html: constructOtpPasswordResetTemplate(
					timeUntilExpiryReadable(otpExpiresAt),
					otp,
				),
				category: EmailCategory.AUTH,
			};
			await this.emailService.send(emailPayload);

			return {
				resetSessionId: dbResult.resetSessionId,
				otpDelivery: body.email,
				expiresAt: otpExpiresAt.toISOString(),
			};
		} catch (error) {
			if (
				error instanceof ForbiddenException ||
				error instanceof HttpException
			) {
				throw error;
			}

			console.log('Password Reset Initiate Error: ', error);
			throw new InternalServerErrorException(
				'Password reset initiation failed, please try again.',
			);
		}
	}

	async passwordResetResendOtp(req: Request, body: PasswordResetResendOtpDto) {
		try {
			const otp: string = generateOtp();
			const otpHash: string = await bcrypt.hash(otp, 10);
			const otpExpiresAt: Date = new Date(Date.now() + 5 * 60 * 1000);

			const dbResult =
				await this.passwordResetRepository.passwordResetResendOtp({
					resetSessionId: body.resetSessionId,
					otpHash: otpHash,
					otpExpiresAt: otpExpiresAt,
				});

			const emailAddress: EmailAddress = { email: dbResult.email };
			const emailPayload: EmailPayload = {
				to: emailAddress,
				subject: 'Password Reset Verification',
				text: `Your password reset verification code is ${otp}`,
				html: constructOtpPasswordResetTemplate(
					timeUntilExpiryReadable(dbResult.otpExpiresAt),
					otp,
				),
				category: EmailCategory.AUTH,
			};

			await this.emailService.send(emailPayload);

			return {
				resetSessionId: body.resetSessionId,
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

			console.log('Password Reset Resend OTP Error: ', error);
			throw new InternalServerErrorException(
				'Resend OTP failed, please try again.',
			);
		}
	}

	async passwordResetConfirm(req: Request, body: PasswordResetConfirmDto) {
		try {
			const sessionData =
				await this.passwordResetRepository.getResetSessionForVerification(
					body.resetSessionId,
				);

			const isOtpValid = await bcrypt.compare(body.otp, sessionData.otpHash);
			if (!isOtpValid) {
				throw new InvalidOtpException();
			}

			const newPasswordHash = await bcrypt.hash(body.newPassword, 10);
			const ipAddress: any = req['ip'] || req['socket']?.remoteAddress;

			await this.passwordResetRepository.passwordResetConfirm({
				sessionData,
				newPasswordHash,
				ipAddress,
			});

			return {
				success: true,
				message:
					'Password reset successful. You can now log in with your new password.',
			};
		} catch (error) {
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException ||
				error instanceof HttpException
			) {
				throw error;
			}

			console.log('Password Reset Confirm Error: ', error);
			throw new InternalServerErrorException(
				'Password reset failed, please try again.',
			);
		}
	}
}
