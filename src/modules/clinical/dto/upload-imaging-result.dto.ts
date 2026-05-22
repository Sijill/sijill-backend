import { IsString, MaxLength } from 'class-validator';

export class UploadImagingResultDto {
	@IsString()
	@MaxLength(2000)
	studyDescription!: string;

	@IsString()
	@MaxLength(20000)
	findings!: string;
}

