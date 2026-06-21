import { IsOptional, IsEnum, IsString, MaxLength } from 'class-validator';

export enum SessionStatus {
	ACTIVE = 'ACTIVE',
	ARCHIVED = 'ARCHIVED',
}

export class UpdateSessionDto {
	@IsOptional()
	@IsEnum(SessionStatus)
	status?: SessionStatus;

	@IsOptional()
	@IsString()
	@MaxLength(300)
	title?: string;
}
