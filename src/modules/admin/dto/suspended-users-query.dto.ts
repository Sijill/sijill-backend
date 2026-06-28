import { IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SuspendedUsersQueryDto {
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	page = 1;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit = 20;
}
