import { NotFoundException, BadRequestException } from '@nestjs/common';

export class RegistrationSessionNotFoundException extends NotFoundException {
	constructor() {
		super('Registration session not found');
	}
}

export class RegistrationSessionExpiredException extends BadRequestException {
	constructor() {
		super('Registration session has expired');
	}
}

export class DatabaseOperationException extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DatabaseOperationException';
	}
}

export class OtpNotFoundException extends NotFoundException {
	constructor() {
		super('OTP not found or does not belong to this registration session');
	}
}

export class OtpAlreadyUsedException extends BadRequestException {
	constructor() {
		super('OTP has already been used');
	}
}

export class OtpExpiredException extends BadRequestException {
	constructor() {
		super('OTP has expired');
	}
}

export class InvalidOtpException extends BadRequestException {
	constructor() {
		super('Invalid OTP');
	}
}
