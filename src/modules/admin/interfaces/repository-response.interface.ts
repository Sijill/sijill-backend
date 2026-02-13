import { UserRole } from '@common/enums/db.enum';

export interface UsersCountByRole {
	patients: number;
	healthcareProviders: number;
	laboratories: number;
	imagingCenters: number;
}

export interface VerificationsCountByAdmin {
	verifiedUsers: number;
	rejectedUsers: number;
}

export interface VerificationDecisionResult {
	userId: string;
	email: string;
	role: string;
	accountStatus: string;
	firstName?: string;
	middleName?: string;
	surname?: string;
	labName?: string;
	centerName?: string;
}
