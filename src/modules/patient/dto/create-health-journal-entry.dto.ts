import { Type } from 'class-transformer';
import {
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { PatientOutcome } from '@common/enums/db.enum';

export class CreateHealthJournalEntryDto {
	@IsString()
	@MaxLength(64)
	diagnosisId!: string;

	@IsEnum(PatientOutcome)
	patientOutcome!: PatientOutcome;

	@IsOptional()
	@IsString()
	patientOutcomeDetails?: string;

	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(10)
	painLevel!: number;

	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(10)
	energyLevel!: number;

	@IsString()
	@MaxLength(2000)
	mood!: string;
}
