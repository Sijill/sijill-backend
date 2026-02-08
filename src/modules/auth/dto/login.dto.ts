import {
	IsEmail,
	IsString,
	IsUUID,
	Length,
	IsEnum,
	IsOptional,
	Matches,
} from 'class-validator';
import { Platform } from '@common/enums/app.enums';

export class LoginDto {
	@IsEmail()
	email: string;

	@IsString()
	password: string;
}

export class LoginResendOtpDto {
	@IsUUID()
	@IsString()
	loginSessionId: string;
}

export class LoginVerifyOtpDto {
	@IsUUID()
	loginSessionId: string;

	@IsString()
	@Length(6, 6)
	otp: string;

	@IsEnum(Platform)
	platform: 'mobile' | 'web';
}

export class RefreshTokenDto {
	@IsOptional()
	@IsString()
	refreshToken?: string;

	@IsEnum(Platform)
	platform: 'mobile' | 'web';
}

export class LogoutDto {
	@IsEnum(Platform)
	platform: 'mobile' | 'web';

	@IsOptional()
	@IsString()
	@Matches(/^[0-9a-fA-F-]{36}\.[a-f0-9]{64}$/, {
		message: 'Invalid refresh token format',
	})
	refreshToken?: string;
}
