import { Injectable, PipeTransform, BadRequestException } from "@nestjs/common";
import { validate } from "class-validator";
import { PatientRegistrationDto } from "../dto/patient-registration.dto";
import { HcpRegistrationDto } from "../dto/hcp-registration.dto";
import { LabRegistrationDto } from "../dto/lab-registration.dto";
import { ImagingRegistrationDto } from "../dto/imaging-registration.dto";
import { UserRole } from "@common/enums/db.enum";
import { plainToInstance } from 'class-transformer';

const DTO_BY_ROLE = {
  [UserRole.PATIENT]: PatientRegistrationDto,
  [UserRole.HEALTHCARE_PROVIDER]: HcpRegistrationDto,
  [UserRole.LAB]: LabRegistrationDto,
  [UserRole.IMAGING_CENTER]: ImagingRegistrationDto,
};

@Injectable()
export class RegistrationBodyPipe implements PipeTransform {
  async transform(body: any) {
    const role = body?.role;

    if (!role || !DTO_BY_ROLE[role]) {
      throw new BadRequestException('Invalid or missing role');
    }

    const dtoClass = DTO_BY_ROLE[role];
    const dto = plainToInstance(dtoClass, body);

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length) {
      throw new BadRequestException(
        errors.flatMap(e => Object.values(e.constraints ?? {})).join(', ')
      );
    }

    return dto;
  }
}
