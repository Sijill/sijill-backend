import { Module } from '@nestjs/common';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';
import { PatientRepository } from './patient.repository';
import { PatientHealthSnapshotService } from './patient-health-snapshot.service';

@Module({
	controllers: [PatientController],
	providers: [
		PatientService,
		PatientRepository,
		PatientHealthSnapshotService,
	],
})
export class PatientModule {}
