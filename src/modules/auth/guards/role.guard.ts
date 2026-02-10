import {
	CanActivate,
	ExecutionContext,
	Injectable,
	ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@common/enums/db.enum';
import { ROLES_KEY } from '@common/decorators/roles.decorator';

@Injectable()
export class RoleGuard implements CanActivate {
	constructor(private reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
			ROLES_KEY,
			[context.getHandler(), context.getClass()],
		);

		if (!requiredRoles) return true;

		const { user } = context.switchToHttp().getRequest();
		if (!user?.role) {
			throw new ForbiddenException('Invalid authentication context.');
		}

		if (!requiredRoles.includes(user.role)) {
			throw new ForbiddenException(
				`Access denied. Required roles: ${requiredRoles.join(', ')}`,
			);
		}

		return true;
	}
}
