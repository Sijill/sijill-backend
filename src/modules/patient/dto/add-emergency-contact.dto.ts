import {
	IsBoolean,
	IsEnum,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';
import { EmergencyContactRelationship } from '@common/enums/db.enum';

export class AddEmergencyContactDto {
	@IsString()
	@MaxLength(200)
	contactName!: string;

	@IsString()
	@MaxLength(20)
	phoneNumber!: string;

	@IsEnum(EmergencyContactRelationship)
	relationship!: EmergencyContactRelationship;

	@IsOptional()
	@IsBoolean()
	isPrimary?: boolean;
}
