import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadImagingResultDto {
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	studyDescription?: string;

	@IsOptional()
	@IsString()
	@MaxLength(20000)
	findings?: string;
}
