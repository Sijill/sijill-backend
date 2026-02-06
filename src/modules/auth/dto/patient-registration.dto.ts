import {
	IsEmail,
	IsString,
	IsDate,
	IsEnum,
	Matches,
	MinLength,
	IsNotEmpty,
} from 'class-validator';
import { UserRole, Gender } from '@common/enums/db.enum';
import { IsValidDateOfBirth } from '@common/validators/dob.validator';

export class PatientRegistrationDto {
	@IsEnum(UserRole)
	@IsNotEmpty()
	role: UserRole.PATIENT;

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
	firstName: string;

	@IsString()
	@IsNotEmpty()
	middleName: string;

	@IsString()
	@IsNotEmpty()
	surName: string;

	@IsEnum(Gender)
	@IsNotEmpty()
	gender: string;

	@IsString()
	@IsValidDateOfBirth()
	@IsNotEmpty()
	dateOfBirth: string;

	@Matches(/^[0-9]{14}$/)
	@IsNotEmpty()
	nationalId: string;
}
