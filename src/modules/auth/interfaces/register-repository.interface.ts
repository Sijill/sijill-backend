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
