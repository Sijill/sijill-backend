import { UserRole } from '@common/enums/db.enum';

export interface RegistrationSessionData {
	email: string;
	passwordHash: string;
	role: UserRole;
	registrationData: object;
	registrationDocuments: object;
	ipAddress: string;
	userAgent: string;
	expiresAt: Date;
}

export interface OtpData {
	registerSessionId: string;
	otpHash: string;
	mfaMethod: string;
	purpose: string;
	expiresAt: Date;
}

export interface RegistrationResult {
	registrationSessionId: string;
	registrationExpiresAt: Date;
	otpExpiresAt: Date;
}

export interface ResendOtpData {
	registrationSessionId: string;
	otpHash: string;
	mfaMethod: string;
	purpose: string;
	expiresAt: Date;
}

export interface ResendOtpResult {
	email: string;
	otpExpiresAt: Date;
}

export interface VerifyOtpData {
	registrationSessionId: string;
	otp: string;
}

export interface RegistrationSessionWithOtp {
	sessionId: string;
	email: string;
	passwordHash: string;
	role: UserRole;
	registrationData: any;
	registrationDocuments: any;
	sessionExpiresAt: Date;
	otpHash: string;
	otpExpiresAt: Date;
	otpUsedAt: Date | null;
}

export interface VerifyOtpResult {
	userId: string;
	email: string;
	role: UserRole;
	otpHash: string;
}
