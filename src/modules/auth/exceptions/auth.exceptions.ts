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