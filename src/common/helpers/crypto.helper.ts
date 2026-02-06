import { randomInt } from 'crypto';

export function generateOtp(length = 6) {
	const min = 10 ** (length - 1);
	const max = 10 ** length - 1;
	return randomInt(min, max + 1).toString();
}
