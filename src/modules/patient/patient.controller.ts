import { Body, Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@guards/auth.guard';
import { RoleGuard } from '@guards/role.guard';
import { StatusGuard } from '@guards/status.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/user.decorator';
import { UserRole } from '@common/enums/db.enum';
import type { CurrentUserType } from '@common/types/current-user.type';
import { PatientService } from './patient.service';
import { CreateHealthJournalEntryDto } from './dto/create-health-journal-entry.dto';

@Controller('api/v1/patient')
@UseGuards(AuthGuard, RoleGuard, StatusGuard)
@Roles(UserRole.PATIENT)
export class PatientController {
	constructor(private readonly patientService: PatientService) {}

	@Get('medical-identity')
	async getMedicalIdentity(@CurrentUser() user: CurrentUserType) {
		return await this.patientService.getMedicalIdentity(user.userId);
	}

	@Get('health-journal/diagnoses')
	async listHealthJournalDiagnoses(@CurrentUser() user: CurrentUserType) {
		return await this.patientService.listHealthJournalDiagnoses(user.userId);
	}

	@Post('health-journal/notes')
	async createHealthJournalEntry(
		@CurrentUser() user: CurrentUserType,
		@Body() dto: CreateHealthJournalEntryDto,
	) {
		return await this.patientService.createHealthJournalEntry(
			user.userId,
			dto,
		);
	}

	@Get('health-journal/notes')
	async listHealthJournalDiagnosesSummary(@CurrentUser() user: CurrentUserType) {
		return await this.patientService.listHealthJournalDiagnosesSummary(user.userId);
	}

	@Get('health-journal/notes/:diagnosisId')
	async listHealthJournalNotes(
		@CurrentUser() user: CurrentUserType,
		@Param('diagnosisId') diagnosisId: string,
	) {
		return await this.patientService.listHealthJournalNotes(user.userId, diagnosisId);
	}
}
