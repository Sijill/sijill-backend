export interface LoginData {
	email: string;
	password: string;
	ipAddress: string;
	userAgent: string;
	loginExpiresAt: Date;
	otpHash: string;
	otpExpiresAt: Date;
}

export interface LoginResult {
	loginSessionId: string;
	otpExpiresAt: Date;
}

export interface ResendLoginOtpData {
	loginSessionId: string;
	otpHash: string;
	otpExpiresAt: Date;
}

export interface ResendLoginOtpResult {
	email: string;
	otpExpiresAt: Date;
}

export interface LoginSessionWithOtp {
	sessionId: string;
	userId: string;
	email: string;
	role: string;
	sessionExpiresAt: Date;
	otpHash: string;
	otpExpiresAt: Date;
	otpUsedAt: Date | null;
}

export interface RefreshTokenData {
	refreshToken: string;
	ipAddress: string;
	userAgent: string;
}

export interface RefreshTokenResult {
	userId: string;
	email: string;
	role: string;
	accessToken: string;
	newRefreshToken: string;
}

export interface InvalidateTokensData {
	email: string;
	ipAddress: string;
	userAgent: string;
}
