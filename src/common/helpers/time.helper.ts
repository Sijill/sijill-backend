export function timeUntilExpiry(expiresAt: Date): number {
	return expiresAt.getTime() - Date.now();
}

export function timeUntilExpiryReadable(expiresAt: Date): string {
	const ms = expiresAt.getTime() - Date.now();

	if (ms <= 0) return 'Expired';

	const minutes = Math.floor(ms / 60000);
	const seconds = Math.floor((ms % 60000) / 1000);

	return `${minutes} minutes ${seconds} seconds`;
}
