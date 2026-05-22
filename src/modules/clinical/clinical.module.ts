import { Module } from '@nestjs/common';
import { ClinicalController } from './clinical.controller';
import { DiagnosticController } from './diagnostic.controller';
import { ClinicalService } from './clinical.service';
import { ClinicalRepository } from './clinical.repository';
import { ClinicalSessionGuard } from './guards/clinical-session.guard';
import { LabSessionGuard } from './guards/lab-session.guard';
import { ImagingSessionGuard } from './guards/imaging-session.guard';

@Module({
	controllers: [ClinicalController, DiagnosticController],
	providers: [
		ClinicalService,
		ClinicalRepository,
		ClinicalSessionGuard,
		LabSessionGuard,
		ImagingSessionGuard,
	],
})
export class ClinicalModule {}
