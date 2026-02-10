import {
	CanActivate,
	ExecutionContext,
	Injectable,
	ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '@db/database.service';
import { AccountStatus } from '@common/enums/db.enum';

@Injectable()
export class StatusGuard implements CanActivate {
	constructor(private readonly databaseService: DatabaseService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();
		const user = request.user;

		if (!user?.userId) {
			throw new ForbiddenException('Invalid authentication context.');
		}

		const result = await this.databaseService.query(
			`SELECT account_status FROM users WHERE id = $1`,
			[user.userId],
		);

		if (result.rowCount === 0) {
			throw new ForbiddenException('User not found.');
		}

		const status: AccountStatus = result.rows[0].account_status;

		if (
			status === AccountStatus.DEACTIVATED ||
			status === AccountStatus.REJECTED ||
			status === AccountStatus.SUSPENDED ||
			status === AccountStatus.PENDING
		) {
			throw new ForbiddenException(`Account is ${status.toLowerCase()}`);
		}

		return true;
	}
}
