import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AccessType, UserRole } from '@common/enums/db.enum';
import type { LabSessionTokenPayload } from '../types/diagnostic-session.type';

@Injectable()
export class LabSessionGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest();
		const authHeader = request.headers['authorization'];

		if (!authHeader) {
			throw new UnauthorizedException('Missing authorization header.');
		}

		const [type, token] = authHeader.split(' ');
		if (type !== 'Bearer' || !token) {
			throw new UnauthorizedException('Invalid authorization format.');
		}

		try {
			const payload = jwt.verify(
				token,
				(process.env.JWT_CLINICAL_SECRET ||
					process.env.JWT_ACCESS_SECRET) as string,
			) as LabSessionTokenPayload;

			if (
				payload.type !== 'LAB_SESSION' ||
				payload.role !== UserRole.LAB ||
				!payload.userId ||
				!payload.patientId ||
				!payload.sessionId ||
				!payload.permissionTokenId ||
				!payload.medicalOrderId ||
				!Object.values(AccessType).includes(payload.accessType)
			) {
				throw new UnauthorizedException('Invalid lab session token.');
			}

			const requestedSessionId = request.params?.sessionId;
			if (requestedSessionId && requestedSessionId !== payload.sessionId) {
				throw new ForbiddenException(
					'Lab session token does not match the requested session.',
				);
			}

			request.labSession = payload;
			return true;
		} catch (error) {
			if (
				error instanceof UnauthorizedException ||
				error instanceof ForbiddenException
			) {
				throw error;
			}

			if (error.name === 'TokenExpiredError') {
				throw new UnauthorizedException('Lab session token has expired.');
			}

			throw new UnauthorizedException('Invalid or expired lab session token.');
		}
	}
}
