import { UserRole } from '@common/enums/db.enum';
import type { ClinicalSessionTokenPayload } from '@modules/clinical/types/clinical-session.type';

declare global {
	namespace Express {
		interface Request {
			user?: {
				userId: string;
				email: string;
				role: UserRole;
			};
			clinicalSession?: ClinicalSessionTokenPayload;
		}
	}
}
