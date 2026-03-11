export interface CookieConfig {
	httpOnly: boolean;
	secure: boolean;
	sameSite: 'strict' | 'lax' | 'none';
	maxAge: number;
	path: string;
}

export function getCookieConfig(): CookieConfig {
	return {
		httpOnly: true,
		secure: process.env.SECURE === 'true',
		sameSite: (process.env.SAME_SITE as 'strict' | 'lax' | 'none') || 'strict',
		maxAge: 7 * 24 * 60 * 60 * 1000,
		path: '/api/v1/auth/refresh',
	};
}