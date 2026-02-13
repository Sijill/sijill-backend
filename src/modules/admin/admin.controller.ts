import {
	Controller,
	Get,
	Post,
	Body,
	Query,
	Param,
	ParseUUIDPipe,
	HttpCode,
	HttpStatus,
	Res,
	StreamableFile,
	NotFoundException,
	UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@guards/auth.guard';
import { RoleGuard } from '@guards/role.guard';
import { StatusGuard } from '@guards/status.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/enums/db.enum';
import { AdminService } from './admin.service';
import { CurrentUser } from '@common/decorators/user.decorator';
import type { CurrentUserType } from '@common/types/current-user.type';
import { VerificationQueueQueryDto } from './dto/verification-queue-query.dto';
import { VerificationDecisionDto } from './dto/verification-decision.dto';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import * as path from 'path';

@Controller('api/v1/admin')
@UseGuards(AuthGuard, RoleGuard, StatusGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	@Get('stats')
	async getStats() {
		return await this.adminService.getStats();
	}

	@Get('activities')
	async getActivities(@CurrentUser() user: CurrentUserType) {
		return await this.adminService.getActivities(user.userId);
	}

	@Get('verification-queue')
	@HttpCode(HttpStatus.OK)
	async getVerificationQueue(@Query() query: VerificationQueueQueryDto) {
		return await this.adminService.getVerificationQueue(query);
	}

	@Get('verification-queue/:userId')
	@HttpCode(HttpStatus.OK)
	async getVerificationDetails(@Param('userId', ParseUUIDPipe) userId: string) {
		return await this.adminService.getVerificationDetails(userId);
	}

	@Get('verification-queue/documents/:documentId')
	async downloadDocument(
		@Param('documentId', ParseUUIDPipe) documentId: string,
		@Res({ passthrough: true }) res: Response,
	): Promise<StreamableFile> {
		const document = await this.adminService.getDocumentForDownload(documentId);

		const fullPath = path.resolve(process.cwd(), document.file_path);

		try {
			await stat(fullPath);
		} catch (error) {
			throw new NotFoundException('File not found.');
		}

		const isImage = document.mime_type.startsWith('image/');
		const isPdf = document.mime_type === 'application/pdf';

		res.set({
			'Content-Type': document.mime_type,
			'Content-Disposition':
				isImage || isPdf
					? `inline; filename="${document.file_name}"`
					: `attachment; filename="${document.file_name}"`,
		});

		const fileStream = createReadStream(fullPath);
		return new StreamableFile(fileStream);
	}

	@Post('verification-queue/decision')
	@HttpCode(HttpStatus.OK)
	async processVerificationDecision(
		@CurrentUser() admin: CurrentUserType,
		@Body() dto: VerificationDecisionDto,
	) {
		return await this.adminService.processVerificationDecision(
			admin.userId,
			dto,
		);
	}
}
