import { Module } from '@nestjs/common';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { ClinicalRepository } from './clinical.repository';
import { ClinicalSessionGuard } from './guards/clinical-session.guard';

@Module({
	controllers: [ClinicalController],
	providers: [ClinicalService, ClinicalRepository, ClinicalSessionGuard],
})
export class ClinicalModule {}
