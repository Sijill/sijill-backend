export interface PendingUser {
	id: string;
	email: string;
	role: string;
	created_at: Date;
}

export interface VerificationQueueResponse {
	data: PendingUser[];
	pagination: {
		limit: number;
		nextCursor: string | null;
		hasMore: boolean;
	};
}

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
