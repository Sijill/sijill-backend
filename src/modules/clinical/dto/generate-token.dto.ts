import { IsEnum, IsInt, IsOptional, IsIn } from 'class-validator';
import { AccessType } from '@common/enums/db.enum';

export enum ClinicalEntityType {
    HEALTHCARE_PROVIDER = 'HEALTHCARE_PROVIDER',
    LAB = 'LAB',
    IMAGING_CENTER = 'IMAGING_CENTER',
}

export class GenerateTokenDto {
    @IsEnum(ClinicalEntityType)
    entityType!: ClinicalEntityType;

    @IsOptional()
    @IsEnum(AccessType)
    accessType?: AccessType;

    @IsInt()
    @IsIn([15, 30, 45, 60])
    expiresInMinutes!: number;
}