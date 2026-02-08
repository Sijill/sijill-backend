export interface PasswordResetInitiateData {
	email: string;
	ipAddress: string;
	userAgent: string;
	resetExpiresAt: Date;
	otpHash: string;
	otpExpiresAt: Date;
}

export interface PasswordResetInitiateResult {
	resetSessionId: string;
	otpExpiresAt: Date;
}

export interface PasswordResetResendOtpData {
	resetSessionId: string;
	otpHash: string;
	otpExpiresAt: Date;
}

export interface PasswordResetResendOtpResult {
	email: string;
	otpExpiresAt: Date;
}

export interface ResetSessionWithOtp {
	sessionId: string;
	userId: string;
	email: string;
	sessionExpiresAt: Date;
	otpHash: string;
	otpExpiresAt: Date;
	otpUsedAt: Date | null;
}

export interface PasswordResetConfirmData {
	sessionData: ResetSessionWithOtp;
	newPasswordHash: string;
	ipAddress: string;
}
