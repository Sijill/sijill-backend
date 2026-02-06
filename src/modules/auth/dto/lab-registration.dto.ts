import {
	IsEnum,
	IsEmail,
	Matches,
	IsString,
	MinLength,
	IsNotEmpty,
} from 'class-validator';
import { UserRole } from '@common/enums/db.enum';

export class LabRegistrationDto {
	@IsEnum(UserRole)
	@IsNotEmpty()
	role: UserRole.LAB;

	@IsEmail()
	@IsNotEmpty()
	email: string;

	@Matches(/^[0-9]{11}$/)
	@IsNotEmpty()
	phoneNumber: string;

	@MinLength(8)
	@IsString()
	@IsNotEmpty()
	password: string;

	@IsString()
	@IsNotEmpty()
	centerName: string;

	@IsString()
	@IsNotEmpty()
	centerAddress: string;

	@IsString()
	@IsNotEmpty()
	registrationNumber: string;

	@IsString()
	@IsNotEmpty()
	administratorFullName: string;
}
