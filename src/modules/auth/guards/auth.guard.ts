import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthGuard implements CanActivate {
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
				process.env.JWT_ACCESS_SECRET as string,
			) as {
				userId: string;
				email: string;
				role: string;
			};

			if (!payload.userId || !payload.email || !payload.role) {
				throw new UnauthorizedException('Invalid token payload.');
			}

			request.user = payload;
			return true;
		} catch (error) {
			if (error.name === 'TokenExpiredError') {
				throw new UnauthorizedException('Access token has expired.');
			}
			throw new UnauthorizedException('Invalid or expired access token.');
		}
	}
}
