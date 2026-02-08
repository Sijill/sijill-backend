import {
	IsEmail,
	IsString,
	IsUUID,
	Length,
	MinLength,
	Matches,
} from 'class-validator';

export class PasswordResetInitiateDto {
	@IsEmail()
	email: string;
}

export class PasswordResetResendOtpDto {
	@IsUUID()
	@IsString()
	resetSessionId: string;
}

export class PasswordResetConfirmDto {
	@IsUUID()
	resetSessionId: string;

	@IsString()
	@Length(6, 6)
	otp: string;

	@IsString()
	@MinLength(8, { message: 'Password must be at least 8 characters long' })
	newPassword: string;
}
