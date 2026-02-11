import {
	NotFoundException,
	UnauthorizedException,
	BadRequestException,
	ForbiddenException,
	ConflictException,
} from '@nestjs/common';

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

export class LoginSessionNotFoundException extends NotFoundException {
	constructor() {
		super('Login session not found or has expired');
	}
}

export class LoginSessionExpiredException extends BadRequestException {
	constructor() {
		super('Login session has expired. Please login again');
	}
}

export class InvalidRefreshTokenException extends UnauthorizedException {
	constructor() {
		super('Invalid refresh token');
	}
}

export class RefreshTokenRevokedException extends UnauthorizedException {
	constructor() {
		super('Refresh token has been revoked');
	}
}

export class RefreshTokenExpiredException extends UnauthorizedException {
	constructor() {
		super('Refresh token has expired. Please login again');
	}
}

export class ResetSessionNotFoundException extends NotFoundException {
	constructor() {
		super('Password reset session not found or expired');
	}
}

export class ResetSessionExpiredException extends ForbiddenException {
	constructor() {
		super('Password reset session has expired. Please request a new one');
	}
}

export class EmailAlreadyInUseException extends ConflictException {
	constructor() {
		super('Email is already registered');
	}
}

export class PendingRegistrationExistsException extends ConflictException {
	constructor() {
		super('A registration with this email already exists and is pending verification');
	}
}
