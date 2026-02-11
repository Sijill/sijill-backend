import {
	Injectable,
	InternalServerErrorException,
	NotFoundException,
	BadRequestException,
	HttpException,
} from '@nestjs/common';

import {
	RegistrationSessionData,
	OtpData,
	RegistrationResult,
	ResendOtpData,
	ResendOtpResult,
	RegistrationSessionWithOtp,
} from '../interfaces/register-repository.interface';

import {
	InvalidOtpException,
	EmailAlreadyInUseException,
	PendingRegistrationExistsException,
} from '../exceptions/auth.exceptions';

import {
	RegisterVerifyOtpDto,
	RegisterResendOtpDto,
} from '../dto/register.dto';

import { constructOtpRegistrationTemplate } from '@email/templates/registration-otp.template';
import { EmailPayload, EmailService, EmailAddress } from '@email/email.service';
import { constructPendingTemplate } from '@email/templates/pending.template';
import type { MulterRequest } from '../interfaces/multer-request.interface';
import { RegisterRepository } from '../repository/register.repository';
import { RegistrationBody } from '../auth.controller';
import { MfaMethod } from '@common/enums/db.enum';
import { generateOtp } from '@helpers/crypto.helper';
import { timeUntilExpiryReadable } from '@helpers/time.helper';
import { EmailCategory } from '@common/enums/email.enums';
import { PinoLogger } from 'nestjs-pino';
import * as bcrypt from 'bcrypt';

@Injectable()
export class RegisterService {
	constructor(
		private readonly emailService: EmailService,
		private readonly registerRepository: RegisterRepository,
		private readonly logger: PinoLogger,
	) {
		this.logger.setContext(RegisterService.name);
	}

	async register(req: MulterRequest, body: RegistrationBody) {
		try {
			const existingUser = await this.registerRepository.findByEmail(
				body.email,
			);
			if (existingUser?.rowCount) {
				const user = existingUser.rows[0];

				if (user.account_status !== 'PENDING') {
					throw new EmailAlreadyInUseException();
				}

				throw new PendingRegistrationExistsException();
			}

			const otp: string = generateOtp();
			const otpHash: string = await bcrypt.hash(otp, 10);
			const passwordHash: string = await bcrypt.hash(body.password, 12);

			const ipAddress: any = req.ip || req.socket.remoteAddress;
			const userAgent: any = req.headers['user-agent'] || 'unknown';

			const registrationExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
			const otpExpiresAt: Date = new Date(Date.now() + 5 * 60 * 1000);

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
			const dbResult: RegistrationResult =
				await this.registerRepository.register(
					registrationSessionData,
					otpData,
				);

			const emailAddress: EmailAddress = {
				email: body.email,
			};
			const emailPayload: EmailPayload = {
				to: emailAddress,
				subject: 'Email Verification',
				text: `You've requested to verify your account. Please use the verification code ${otp} to complete the process.`,
				html: constructOtpRegistrationTemplate(
					timeUntilExpiryReadable(otpExpiresAt),
					otp,
				),
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
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException ||
				error instanceof HttpException
			) {
				throw error;
			}

			this.logger.error('Registration Error: ', error);
			throw new InternalServerErrorException(
				'Registration failed, please try again.'
			);
		}
	}

	async registerResendOtp(req: Request, body: RegisterResendOtpDto) {
		try {
			const otp: string = generateOtp();
			const otpHash: string = await bcrypt.hash(otp, 10);
			const otpExpiresAt: Date = new Date(Date.now() + 5 * 60 * 1000);

			const resendOtpData: ResendOtpData = {
				registrationSessionId: body.registrationSessionId,
				otpHash: otpHash,
				mfaMethod: MfaMethod.EMAIL_OTP,
				purpose: 'Registration OTP',
				expiresAt: otpExpiresAt,
			};

			const dbResult: ResendOtpResult =
				await this.registerRepository.registerResendOtp(resendOtpData);

			const emailAddress: EmailAddress = {
				email: dbResult.email,
			};

			const emailPayload: EmailPayload = {
				to: emailAddress,
				subject: 'Email Verification',
				text: `You've requested to verify your account. Please use the verification code ${otp} to complete the process.`,
				html: constructOtpRegistrationTemplate(
					timeUntilExpiryReadable(dbResult.otpExpiresAt),
					otp,
				),
				category: EmailCategory.AUTH,
			};

			await this.emailService.send(emailPayload);

			const response = {
				registrationSessionId: body.registrationSessionId,
				otpDelivery: dbResult.email,
				expiresAt: dbResult.otpExpiresAt.toISOString(),
			};

			return response;
		} catch (error) {
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException ||
				error instanceof HttpException
			) {
				throw error;
			}

			this.logger.error('Resend OTP Error: ', error);
			throw new InternalServerErrorException(
				'Resend OTP failed, please try again.',
			);
		}
	}

	async registerVerifyOtp(req: Request, body: RegisterVerifyOtpDto) {
		try {
			const sessionData: RegistrationSessionWithOtp =
				await this.registerRepository.getRegistrationSessionForVerification(
					body.registrationSessionId,
				);

			const isOtpValid = await bcrypt.compare(body.otp, sessionData.otpHash);
			if (!isOtpValid) {
				throw new InvalidOtpException();
			}

			const { userId } =
				await this.registerRepository.completeRegistration(sessionData);

			const emailAddress: EmailAddress = {
				email: sessionData.email,
			};

			const emailPayload: EmailPayload = {
				to: emailAddress,
				subject: 'Welcome to Sijill - Application Under Review',
				html: constructPendingTemplate(sessionData.email),
				category: EmailCategory.AUTH,
			};

			await this.emailService.send(emailPayload);

			const response = {
				success: true,
				message:
					'Registration completed successfully. Your application is under review.',
				userId: userId,
				email: sessionData.email,
				role: sessionData.role,
			};

			return response;
		} catch (error) {
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException ||
				error instanceof HttpException
			) {
				throw error;
			}

			this.logger.error('Verify OTP Error: ', error);
			throw new InternalServerErrorException(
				'OTP verification failed, please try again.',
			);
		}
	}
}
