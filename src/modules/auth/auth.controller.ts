import {
	Controller,
	Post,
	UseInterceptors,
	UseFilters,
	Body,
	Req,
    Request,
} from '@nestjs/common';
import { RegistrationFileInterceptor } from './interceptors/registration.interceptor';
import { FileValidationInterceptor } from './interceptors/file-validation.interceptor';
import { RegistrationBodyPipe } from './pipes/registration.pipe';
import type { MulterRequest } from './interfaces/multer-request.interface';
import { PatientRegistrationDto } from './dto/patient-registration.dto';
import { HcpRegistrationDto } from './dto/hcp-registration.dto';
import { LabRegistrationDto } from './dto/lab-registration.dto';
import { ImagingRegistrationDto } from './dto/imaging-registration.dto';
import { FileCleanupFilter } from './filters/cleanup.filter';
import { AuthService } from './auth.service';
import { RegisterResendOtpDto } from './dto/resend-otp.dto';

export type RegistrationBody =
	| PatientRegistrationDto
	| HcpRegistrationDto
	| LabRegistrationDto
	| ImagingRegistrationDto;

@Controller('api/v1/auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('register')
	@UseInterceptors(RegistrationFileInterceptor, FileValidationInterceptor)
	@UseFilters(FileCleanupFilter)
	async register(
		@Req() req: MulterRequest,
		@Body(RegistrationBodyPipe) body: RegistrationBody,
	) {
		return await this.authService.register(req, body);
	}

	@Post('register/resend-otp')
	async registerResendOtp(
        @Req() req: Request,
        @Body() body: RegisterResendOtpDto
    ) {
        return await this.authService.registerResendOtp(req, body);
    }

	@Post('register/verify-otp')
	async registerVerifyOtp() {}

	@Post('login')
	async login() {}

	@Post('login/resend-otp')
	async loginResendOtp() {}

	@Post('login/verify-otp')
	async loginVerifyOtp() {}

	@Post('password-reset/initiate')
	async passwordResetInitiate() {}

	@Post('password-reset/resend-otp')
	async passwordResetResendOtp() {}

	@Post('password-reset/confirm')
	async passwordResetConfirm() {}

	@Post('refresh')
	async refreshAccessToken() {}
}
