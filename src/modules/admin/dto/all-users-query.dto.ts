import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole, AccountStatus } from '@common/enums/db.enum';

export class AllUsersQueryDto {
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

	@IsOptional()
	@IsEnum(UserRole)
	role?: UserRole;

	@IsOptional()
	@IsEnum(AccountStatus)
	status?: AccountStatus;
}
