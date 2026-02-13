import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@common/enums/db.enum';

export enum VerificationQueueRole {
	PATIENT = UserRole.PATIENT,
	HCP = UserRole.HEALTHCARE_PROVIDER,
	LAB = UserRole.LAB,
	IMAGING_CENTER = UserRole.IMAGING_CENTER,
}

export class VerificationQueueQueryDto {
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit = 20;

	@IsOptional()
	@IsUUID()
	cursor?: string;

	@IsOptional()
	@IsEnum(VerificationQueueRole)
	role?: VerificationQueueRole;
}
