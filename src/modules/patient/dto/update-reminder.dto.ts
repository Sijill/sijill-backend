import {
	ArrayMaxSize,
	IsArray,
	IsBoolean,
	IsInt,
	IsOptional,
	Matches,
	Max,
	Min,
} from 'class-validator';

export class UpdateReminderDto {
	@IsOptional()
	@Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
	reminder_time?: string;

	@IsOptional()
	@Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
	reminderTime?: string;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(7)
	@IsInt({ each: true })
	@Min(1, { each: true })
	@Max(7, { each: true })
	custom_days?: number[] | null;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(7)
	@IsInt({ each: true })
	@Min(1, { each: true })
	@Max(7, { each: true })
	customDays?: number[] | null;

	@IsOptional()
	@IsBoolean()
	is_active?: boolean;

	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}
