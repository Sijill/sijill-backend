import { UserRole } from '@common/enums/db.enum';

export interface CurrentUserType {
	userId: string;
	email: string;
	role: UserRole;
}
