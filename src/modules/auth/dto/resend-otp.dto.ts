import { IsUUID, IsString } from 'class-validator';

export class RegisterResendOtpDto {
	@IsUUID()
	@IsString()
	registrationSessionId: string;
}
