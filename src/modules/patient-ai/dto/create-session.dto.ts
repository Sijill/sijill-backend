import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSessionDto {
	@IsOptional()
	@IsString()
	@MaxLength(300)
	title?: string;
}
