import {
	Controller,
	Post,
	UseInterceptors,
	UseFilters,
	Body,
	Req,
	Res,
	Request,
} from '@nestjs/common';

import {
	LoginDto,
	LoginResendOtpDto,
	LoginVerifyOtpDto,
	RefreshTokenDto,
	LogoutDto,
} from './dto/login.dto';

import {
	PasswordResetConfirmDto,
	PasswordResetInitiateDto,
	PasswordResetResendOtpDto,
} from './dto/reset-password.dto';

import type {
	Request as ExpressRequest,
	Response as ExpressResponse,
} from 'express';

import { RegistrationFileInterceptor } from './interceptors/registration.interceptor';
import { FileValidationInterceptor } from './interceptors/file-validation.interceptor';
import { RegistrationBodyPipe } from './pipes/registration.pipe';
import type { MulterRequest } from './interfaces/multer-request.interface';
import { PatientRegistrationDto } from './dto/patient-registration.dto';
import { HcpRegistrationDto } from './dto/hcp-registration.dto';
import { LabRegistrationDto } from './dto/lab-registration.dto';
import { ImagingRegistrationDto } from './dto/imaging-registration.dto';
import { FileCleanupFilter } from './filters/cleanup.filter';
import { RegisterVerifyOtpDto, RegisterResendOtpDto } from './dto/register.dto';
import { RegisterService } from './services/register.service';
import { LoginService } from './services/login.service';
import { PasswordResetService } from './services/reset-password.service';
import { Throttle } from '@nestjs/throttler';

export type RegistrationBody =
	| PatientRegistrationDto
	| HcpRegistrationDto
	| LabRegistrationDto
	| ImagingRegistrationDto;

@Controller('api/v1/auth')
@Throttle({ default: { limit: 5, ttl: 60000 } })
export class AuthController {
	constructor(
		private readonly registerService: RegisterService,
		private readonly loginService: LoginService,
		private readonly passwordResetService: PasswordResetService,
	) {}

	@Post('register')
	@UseInterceptors(RegistrationFileInterceptor, FileValidationInterceptor)
	@UseFilters(FileCleanupFilter)
	async register(
		@Req() req: MulterRequest,
		@Body(RegistrationBodyPipe) body: RegistrationBody,
	) {
		return await this.registerService.register(req, body);
	}

	@Post('register/resend-otp')
	async registerResendOtp(
		@Req() req: Request,
		@Body() body: RegisterResendOtpDto,
	) {
		return await this.registerService.registerResendOtp(req, body);
	}

	@Post('register/verify-otp')
	async registerVerifyOtp(
		@Req() req: Request,
		@Body() body: RegisterVerifyOtpDto,
	) {
		return await this.registerService.registerVerifyOtp(req, body);
	}

	@Post('login')
	async login(@Req() req: Request, @Body() body: LoginDto) {
		return await this.loginService.login(req, body);
	}

	@Post('login/resend-otp')
	async loginResendOtp(@Req() req: Request, @Body() body: LoginResendOtpDto) {
		return await this.loginService.loginResendOtp(req, body);
	}

	@Post('login/verify-otp')
	async loginVerifyOtp(
		@Req() req: ExpressRequest,
		@Res({ passthrough: true }) res: ExpressResponse,
		@Body() body: LoginVerifyOtpDto,
	) {
		return await this.loginService.loginVerifyOtp(req, res, body);
	}

	@Post('refresh')
	async refresh(
		@Req() req: ExpressRequest,
		@Res({ passthrough: true }) res: ExpressResponse,
		@Body() body: RefreshTokenDto,
	) {
		return await this.loginService.refresh(req, res, body);
	}

	@Post('logout')
	async logout(
		@Req() req: ExpressRequest,
		@Res({ passthrough: true }) res: ExpressResponse,
		@Body() body: LogoutDto,
	) {
		return await this.loginService.logout(req, res, body);
	}

	@Post('password-reset')
	async passwordResetInitiate(
		@Req() req: Request,
		@Body() body: PasswordResetInitiateDto,
	) {
		return await this.passwordResetService.passwordResetInitiate(req, body);
	}

	@Post('password-reset/resend-otp')
	async passwordResetResendOtp(
		@Req() req: Request,
		@Body() body: PasswordResetResendOtpDto,
	) {
		return await this.passwordResetService.passwordResetResendOtp(req, body);
	}

	@Post('password-reset/confirm')
	async passwordResetConfirm(
		@Req() req: Request,
		@Body() body: PasswordResetConfirmDto,
	) {
		return await this.passwordResetService.passwordResetConfirm(req, body);
	}
}
