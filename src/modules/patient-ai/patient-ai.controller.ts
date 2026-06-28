import {
	Controller,
	Get,
	Post,
	Patch,
	Delete,
	Param,
	Body,
	Query,
	UseGuards,
	ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '@guards/auth.guard';
import { RoleGuard } from '@guards/role.guard';
import { StatusGuard } from '@guards/status.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/user.decorator';
import { UserRole } from '@common/enums/db.enum';
import type { CurrentUserType } from '@common/types/current-user.type';
import { PatientAIService } from './patient-ai.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('api/v1/patient/ai')
@UseGuards(AuthGuard, RoleGuard, StatusGuard)
@Roles(UserRole.PATIENT)
export class PatientAIController {
	constructor(private readonly patientAIService: PatientAIService) {}

	@Post('chat/sessions')
	async createSession(
		@CurrentUser() user: CurrentUserType,
		@Body() dto: CreateSessionDto,
	) {
		return await this.patientAIService.createSession(user.userId, dto.title);
	}

	@SkipThrottle()
	@Get('chat/sessions')
	async listSessions(
		@CurrentUser() user: CurrentUserType,
		@Query('status') status?: string,
	) {
		return await this.patientAIService.listSessions(user.userId, status);
	}

	@SkipThrottle()
	@Get('chat/sessions/:sessionId')
	async getSession(
		@CurrentUser() user: CurrentUserType,
		@Param('sessionId', ParseUUIDPipe) sessionId: string,
	) {
		return await this.patientAIService.getSession(user.userId, sessionId);
	}

	@SkipThrottle()
	@Patch('chat/sessions/:sessionId')
	async updateSession(
		@CurrentUser() user: CurrentUserType,
		@Param('sessionId', ParseUUIDPipe) sessionId: string,
		@Body() dto: UpdateSessionDto,
	) {
		return await this.patientAIService.updateSession(
			user.userId,
			sessionId,
			dto,
		);
	}

	@SkipThrottle()
	@Delete('chat/sessions')
	async deleteAllSessions(@CurrentUser() user: CurrentUserType) {
		return await this.patientAIService.deleteAllSessions(user.userId);
	}

	@SkipThrottle()
	@Delete('chat/sessions/:sessionId')
	async deleteSession(
		@CurrentUser() user: CurrentUserType,
		@Param('sessionId', ParseUUIDPipe) sessionId: string,
	) {
		return await this.patientAIService.deleteSession(user.userId, sessionId);
	}

	@Throttle({ default: { limit: 10, ttl: 60000 } })
	@Post('chat/sessions/:sessionId/messages')
	async sendMessage(
		@CurrentUser() user: CurrentUserType,
		@Param('sessionId', ParseUUIDPipe) sessionId: string,
		@Body() dto: SendMessageDto,
	) {
		return await this.patientAIService.sendMessage(
			user.userId,
			sessionId,
			dto.content,
		);
	}
}
