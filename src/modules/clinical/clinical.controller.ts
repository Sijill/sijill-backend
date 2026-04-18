import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseIntPipe,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@guards/auth.guard';
import { RoleGuard } from '@guards/role.guard';
import { StatusGuard } from '@guards/status.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/user.decorator';
import { UserRole } from '@common/enums/db.enum';
import type { CurrentUserType } from '@common/types/current-user.type';
import { ClinicalService } from './clinical.service';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { UpdateVitalsDto } from './dto/update-vitals.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { ClinicalSessionGuard } from './guards/clinical-session.guard';
import { CurrentClinicalSession } from './decorators/current-clinical-session.decorator';
import type { ClinicalSessionTokenPayload } from './types/clinical-session.type';

@Controller('api/v1/clinical')
export class ClinicalController {
	constructor(private readonly clinicalService: ClinicalService) {}

	@Post('permission-tokens')
	@UseGuards(AuthGuard, RoleGuard, StatusGuard)
	@Roles(UserRole.PATIENT)
	async generatePermissionToken(
		@CurrentUser() user: CurrentUserType,
		@Body() dto: GenerateTokenDto,
	) {
		return await this.clinicalService.generatePermissionToken(user.userId, dto);
	}

	@Get('permission-tokens')
	@UseGuards(AuthGuard, RoleGuard, StatusGuard)
	@Roles(UserRole.PATIENT)
	async listPermissionTokens(@CurrentUser() user: CurrentUserType) {
		return await this.clinicalService.listActivePermissionTokens(user.userId);
	}

	@Patch('permission-tokens/:tokenId/revoke')
	@UseGuards(AuthGuard, RoleGuard, StatusGuard)
	@Roles(UserRole.PATIENT)
	@HttpCode(HttpStatus.OK)
	async revokePermissionToken(
		@CurrentUser() user: CurrentUserType,
		@Param('tokenId', ParseUUIDPipe) tokenId: string,
	) {
		return await this.clinicalService.revokePermissionToken(
			user.userId,
			tokenId,
		);
	}

	@Post('sessions')
	@UseGuards(AuthGuard, RoleGuard, StatusGuard)
	@Roles(UserRole.HEALTHCARE_PROVIDER)
	async startSession(
		@CurrentUser() user: CurrentUserType,
		@Body() dto: StartSessionDto,
	) {
		return await this.clinicalService.startSession(user.userId, dto);
	}

	@Get('sessions/:sessionId/medical-identity')
	@UseGuards(ClinicalSessionGuard)
	async getMedicalIdentity(
		@Param('sessionId', ParseUUIDPipe) _sessionId: string,
		@CurrentClinicalSession() session: ClinicalSessionTokenPayload,
	) {
		return await this.clinicalService.getMedicalIdentity(session);
	}

	@Patch('sessions/:sessionId/medical-identity')
	@UseGuards(ClinicalSessionGuard)
	@HttpCode(HttpStatus.OK)
	async updateMedicalIdentity(
		@Param('sessionId', ParseUUIDPipe) _sessionId: string,
		@CurrentClinicalSession() session: ClinicalSessionTokenPayload,
		@Body() dto: UpdateVitalsDto,
	) {
		return await this.clinicalService.updateVitals(session, dto);
	}

	@Get('sessions/:sessionId/medical-history')
	@UseGuards(ClinicalSessionGuard)
	async getMedicalHistory(
		@Param('sessionId', ParseUUIDPipe) _sessionId: string,
		@CurrentClinicalSession() session: ClinicalSessionTokenPayload,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
	) {
		return await this.clinicalService.getMedicalHistory(session, page, limit);
	}

	@Get('sessions/:sessionId/medical-history/:encounterId')
	@UseGuards(ClinicalSessionGuard)
	async getEncounterDetail(
		@Param('sessionId', ParseUUIDPipe) _sessionId: string,
		@Param('encounterId', ParseUUIDPipe) encounterId: string,
		@CurrentClinicalSession() session: ClinicalSessionTokenPayload,
	) {
		return await this.clinicalService.getEncounterDetail(session, encounterId);
	}

	@Post('sessions/:sessionId/encounters')
	@UseGuards(ClinicalSessionGuard)
	async createEncounter(
		@Param('sessionId', ParseUUIDPipe) _sessionId: string,
		@CurrentClinicalSession() session: ClinicalSessionTokenPayload,
		@Body() dto: CreateEncounterDto,
	) {
		return await this.clinicalService.createEncounter(session, dto);
	}
}
