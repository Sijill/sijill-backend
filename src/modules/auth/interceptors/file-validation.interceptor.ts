import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { UserRole } from '@common/enums/db.enum';
import { MulterRequest } from '../interfaces/multer-request.interface';
import { Observable } from 'rxjs';

const REQUIRED_FILES_BY_ROLE = {
  [UserRole.PATIENT]: [
    'nationalIdFront',
    'nationalIdBack',
    'selfieWithId',
  ],
  [UserRole.HEALTHCARE_PROVIDER]: [
    'nationalIdFront',
    'nationalIdBack',
    'medicalLicenseDocument',
    'workplaceDocument',
  ],
  [UserRole.LAB]: [
    'accreditationDocument',
    'proofOfAddress',
    'labLogo',
  ],
  [UserRole.IMAGING_CENTER]: [
    'accreditationDocument',
    'proofOfAddress',
    'centerLogo',
  ],
} as const;

@Injectable()
export class FileValidationInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest<MulterRequest>();
    const { body, files } = req;

    const role = body?.role;
    if (!role || !REQUIRED_FILES_BY_ROLE[role]) {
        throw new BadRequestException('Invalid or missing role');
    }
    
    const requiredFiles = REQUIRED_FILES_BY_ROLE[role];

    for (const field of requiredFiles) {
      if (!files?.[field]?.length) {
        throw new BadRequestException(`Missing required file: ${field}`);
      }
    }

    return next.handle();
  }
}
