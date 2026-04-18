import {
    IsString,
    IsBoolean,
    IsOptional,
    IsArray,
    IsEnum,
    IsInt,
    IsDateString,
    ValidateNested,
    ArrayMinSize,
    MaxLength,
    Min,
    IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    AllergySeverity,
    DosageUnit,
    MedicationForm,
    OrderPriority,
} from '@common/enums/db.enum';

export class SymptomInputDto {
    @IsString()
    @MaxLength(500)
    title!: string;

    @IsOptional()
    @IsString()
    description?: string;
}

export class DiagnosisInputDto {
    @IsString()
    @MaxLength(20)
    icd11Code!: string;

    @IsString()
    @MaxLength(500)
    icd11Title!: string;

    @IsOptional()
    @IsString()
    clinicalDescription?: string;

    @IsOptional()
    @IsBoolean()
    isChronic?: boolean = false;
}

export class MedicationInputDto {
    @IsString()
    @MaxLength(500)
    medicationName!: string;

    @IsNumber()
    @Min(0)
    dosageAmount!: number;

    @IsEnum(DosageUnit)
    dosageUnit!: DosageUnit;

    @IsEnum(MedicationForm)
    form!: MedicationForm;

    @IsString()
    @MaxLength(500)
    frequency!: string;

    @IsDateString()
    startDate!: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    @IsOptional()
    @IsString()
    instructions?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    diagnosisIndex?: number;
}

export class LabOrderInputDto {
    @IsInt()
    testTypeId!: number;

    @IsOptional()
    @IsInt()
    specimenTypeId?: number;

    @IsEnum(OrderPriority)
    priority!: OrderPriority;

    @IsOptional()
    @IsBoolean()
    fastingRequired?: boolean = false;

    @IsOptional()
    @IsString()
    clinicalIndication?: string;
}

export class ImagingOrderInputDto {
    @IsInt()
    imagingTypeId!: number;

    @IsInt()
    bodyPartId!: number;

    @IsEnum(OrderPriority)
    priority!: OrderPriority;

    @IsOptional()
    @IsBoolean()
    contrastUsed?: boolean = false;

    @IsOptional()
    @IsString()
    clinicalIndication?: string;
}

export class AllergyInputDto {
    @IsString()
    @MaxLength(500)
    allergenName!: string;

    @IsEnum(AllergySeverity)
    severity!: AllergySeverity;

    @IsOptional()
    @IsString()
    reactionDescription?: string;
}

export class CreateEncounterDto {
    @IsOptional()
    @IsString()
    locationAddress?: string;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => SymptomInputDto)
    symptoms!: SymptomInputDto[];

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => DiagnosisInputDto)
    diagnoses!: DiagnosisInputDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MedicationInputDto)
    medications?: MedicationInputDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LabOrderInputDto)
    labOrders?: LabOrderInputDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ImagingOrderInputDto)
    imagingOrders?: ImagingOrderInputDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AllergyInputDto)
    allergies?: AllergyInputDto[];

    @IsOptional()
    @IsDateString()
    nextAppointmentDate?: string;

    @IsOptional()
    @IsString()
    appointmentNotes?: string;
}