import {
	IsEnum,
	IsEmail,
	IsString,
	Matches,
	MinLength,
	IsNotEmpty,
} from 'class-validator';
import { UserRole, Gender } from '@common/enums/db.enum';
import { IsValidDateOfBirth } from '@common/validators/dob.validator';

export class HcpRegistrationDto {
	@IsEnum(UserRole)
	@IsNotEmpty()
	role: UserRole.HEALTHCARE_PROVIDER;

	@IsEmail()
	@IsNotEmpty()
	email: string;

	@Matches(/^[0-9]{11}$/)
	@IsNotEmpty()
	phoneNumber: string;

	@MinLength(8, { message: 'Password must be at least 8 characters long' })
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

	@IsString()
	@IsNotEmpty()
	medicalLicenseNumber: string;

	@IsString()
	@IsNotEmpty()
	specialization: string;

	@IsString()
	@IsNotEmpty()
	workplaceName: string;

	@IsString()
	@IsNotEmpty()
	workplaceAddress: string;
}
