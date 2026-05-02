import {
	Body,
	Controller,
	Delete,
	Get,
	Post,
	Param,
	UseGuards,
	UseInterceptors,
	UploadedFile,
	Res,
	StreamableFile,
	BadRequestException,
	Patch,
	ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
	multerStorage,
	multerLimits,
	multerFileFilter,
} from '@common/multer/multer.config';
import { AddEmergencyContactDto } from './dto/add-emergency-contact.dto';
import type { Response } from 'express';
import { AuthGuard } from '@guards/auth.guard';
import { RoleGuard } from '@guards/role.guard';
import { StatusGuard } from '@guards/status.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/user.decorator';
import { UserRole } from '@common/enums/db.enum';
import type { CurrentUserType } from '@common/types/current-user.type';
import { PatientService } from './patient.service';
import { CreateHealthJournalEntryDto } from './dto/create-health-journal-entry.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

@Controller('api/v1/patient')
@UseGuards(AuthGuard, RoleGuard, StatusGuard)
@Roles(UserRole.PATIENT)
export class PatientController {
	constructor(private readonly patientService: PatientService) {}

	@Get('medical-identity')
	async getMedicalIdentity(@CurrentUser() user: CurrentUserType) {
		return await this.patientService.getMedicalIdentity(user.userId);
	}

	@Get('reminders')
	async listReminders(@CurrentUser() user: CurrentUserType) {
		return await this.patientService.listActiveReminders(user.userId);
	}

	@Get('reminders/active')
	async listActiveReminders(@CurrentUser() user: CurrentUserType) {
		return await this.patientService.listActiveReminders(user.userId);
	}

	@Patch('reminders/:reminderId')
	async updateReminder(
		@CurrentUser() user: CurrentUserType,
		@Param('reminderId', ParseUUIDPipe) reminderId: string,
		@Body() dto: UpdateReminderDto,
	) {
		return await this.patientService.updateReminder(
			user.userId,
			reminderId,
			dto,
		);
	}

	@Get('notifications')
	async listNotifications(@CurrentUser() user: CurrentUserType) {
		return await this.patientService.listNotifications(user.userId);
	}

	@Get('notifications/pending')
	async listPendingNotifications(@CurrentUser() user: CurrentUserType) {
		return await this.patientService.consumePendingNotifications(user.userId);
	}

	@Patch('notifications/:notificationId/read')
	async markNotificationRead(
		@CurrentUser() user: CurrentUserType,
		@Param('notificationId', ParseUUIDPipe) notificationId: string,
	) {
		return await this.patientService.markNotificationRead(
			user.userId,
			notificationId,
		);
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
		return await this.patientService.createHealthJournalEntry(user.userId, dto);
	}

	@Get('health-journal/notes')
	async listHealthJournalDiagnosesSummary(
		@CurrentUser() user: CurrentUserType,
	) {
		return await this.patientService.listHealthJournalDiagnosesSummary(
			user.userId,
		);
	}

	@Get('health-journal/notes/:diagnosisId')
	async listHealthJournalNotes(
		@CurrentUser() user: CurrentUserType,
		@Param('diagnosisId') diagnosisId: string,
	) {
		return await this.patientService.listHealthJournalNotes(
			user.userId,
			diagnosisId,
		);
	}

	@Post('profile-picture')
	@UseInterceptors(
		FileInterceptor('profilePicture', {
			storage: multerStorage,
			limits: multerLimits,
			fileFilter: multerFileFilter,
		}),
	)
	async uploadProfilePicture(
		@CurrentUser() user: CurrentUserType,
		@UploadedFile() file: Express.Multer.File,
	) {
		if (!file) {
			throw new BadRequestException('No file uploaded.');
		}
		return await this.patientService.uploadProfilePicture(user.userId, file);
	}

	@Get('profile-picture')
	async getProfilePicture(
		@CurrentUser() user: CurrentUserType,
		@Res({ passthrough: true }) res: Response,
	): Promise<StreamableFile> {
		return await this.patientService.getProfilePicture(user.userId, res);
	}

	// --- emergency contacts ---

	@Post('emergency-contacts')
	async addEmergencyContact(
		@CurrentUser() user: CurrentUserType,
		@Body() dto: AddEmergencyContactDto,
	) {
		return await this.patientService.addEmergencyContact(user.userId, dto);
	}

	@Delete('emergency-contacts/:contactId')
	async removeEmergencyContact(
		@CurrentUser() user: CurrentUserType,
		@Param('contactId') contactId: string,
	) {
		return await this.patientService.removeEmergencyContact(
			user.userId,
			contactId,
		);
	}
}
