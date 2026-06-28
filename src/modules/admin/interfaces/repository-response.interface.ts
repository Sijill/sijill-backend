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

export interface UsersMeta {
	totalUsers: number;
	suspendedUsers: number;
}

export interface UserListItem {
	id: string;
	email: string;
	name: string | null;
	role: string;
	status: string;
	joinedAt: Date;
	lastActive: Date;
}

export interface PaginatedUsersResponse {
	data: UserListItem[];
	pagination: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	};
}

export interface SuspendedUserListItem {
	id: string;
	email: string;
	name: string | null;
	role: string;
	status: string;
	joined_at: Date;
	suspended_at: Date;
	suspention_reason: string;
}

export interface PaginatedSuspendedUsersResponse {
	data: SuspendedUserListItem[];
	pagination: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	};
}
