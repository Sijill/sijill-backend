import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { EmailPayload, EmailService, EmailAddress } from '@email/email.service';
import { RegistrationBody } from './auth.controller';
import type { MulterRequest } from './interfaces/multer-request.interface';
import { MfaMethod } from '@common/enums/db.enum';
import { generateOtp } from '@helpers/crypto.helper';
import { constructOtpTemplate } from '@email/templates/otp.template';
import { AuthRepository } from './repository/auth.repository';
import { timeUntilExpiryReadable } from '@helpers/time.helper';
import {
	RegistrationSessionData,
	OtpData,
	RegistrationResult,
} from './interfaces/register-repository.interface';
import * as bcrypt from 'bcrypt';
import { EmailCategory } from '@common/enums/email.enums';

@Injectable()
export class AuthService {
	constructor(
		private readonly emailService: EmailService,
		private readonly authRepository: AuthRepository,
	) {}

	async register(req: MulterRequest, body: RegistrationBody) {
		try {
			const otp: string = generateOtp();
			const otpHash: string = await bcrypt.hash(otp, 10);
			const passwordHash: string = await bcrypt.hash(body.password, 12);

			const ipAddress: any = req.ip || req.socket.remoteAddress;
			const userAgent: any = req.headers['user-agent'] || 'unknown';

			const registrationExpiresAt = new Date(Date.now() + 30 * 60 * 1000); //30 minutes
			const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); //5 minutes

			const registrationSessionData: RegistrationSessionData = {
				email: body.email,
				passwordHash: passwordHash,
				role: body.role,
				registrationData: body,
				registrationDocuments: req.files,
				ipAddress: ipAddress,
				userAgent: userAgent,
				expiresAt: registrationExpiresAt,
			};
			const otpData: Omit<OtpData, 'registerSessionId'> = {
				otpHash: otpHash,
				mfaMethod: MfaMethod.EMAIL_OTP,
				purpose: 'Registration OTP',
				expiresAt: otpExpiresAt,
			};
			const dbResult: RegistrationResult = await this.authRepository.register(
				registrationSessionData,
				otpData,
			);

			const emailAddress: EmailAddress = {
				email: body.email,
			};
			const emailPayload: EmailPayload = {
				to: emailAddress,
				subject: 'Email Verification',
				text: `You've requested to verify your account. Please use the verification code ${otp} to complete the process:`,
				html: constructOtpTemplate(timeUntilExpiryReadable(otpExpiresAt), otp),
				category: EmailCategory.AUTH,
			};
			await this.emailService.send(emailPayload);

			const response = {
				registrationSessionId: dbResult.registrationSessionId,
				otpDelivery: body.email,
				expiresAt: otpExpiresAt.toISOString(),
			};
			return response;
		} catch (error) {
			console.log('Registration Error: ', error);
			throw new InternalServerErrorException(
				'Registration failed, please try again.',
			);
		}
	}
}
