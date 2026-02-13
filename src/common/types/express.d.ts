import { UserRole } from '@common/enums/db.enum';

declare global {
	namespace Express {
		interface Request {
			user?: {
				userId: string;
				email: string;
				role: UserRole;
			};
		}
	}
}
