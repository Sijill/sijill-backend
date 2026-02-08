import { IsString, IsNotEmpty, IsUUID, Matches, Length } from 'class-validator';

export class RegisterVerifyOtpDto {
	@IsString()
	@IsNotEmpty()
	registrationSessionId: string;

	@IsString()
	@Length(6, 6)
	@Matches(/^[0-9]{6}$/, {
		message: 'OTP must be a 6-digit number',
	})
	@IsNotEmpty()
	otp: string;
}

export class RegisterResendOtpDto {
	@IsUUID()
	@IsString()
	registrationSessionId: string;
}
