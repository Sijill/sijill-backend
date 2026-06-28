import { IsJSON, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadLabResultDto {
	@IsString()
	@IsJSON()
	@MaxLength(100000)
	resultData!: string;

	@IsOptional()
	@IsString()
	@MaxLength(5000)
	additionalNotes?: string;
}
