import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BloodType } from '@common/enums/db.enum';

export class UpdateVitalsDto {
    @IsOptional()
    @IsEnum(BloodType)
    bloodType?: BloodType;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(500)
    weightKg?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(300)
    heightCm?: number;
}