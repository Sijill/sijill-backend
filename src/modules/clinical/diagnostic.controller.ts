import {
	BadRequestException,
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	UploadedFiles,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import * as path from 'path';
import {
	multerFileFilter,
	multerLimits,
	multerStorage,
} from '@common/multer/multer.config';
import { AuthGuard } from '@guards/auth.guard';
import { RoleGuard } from '@guards/role.guard';
import { StatusGuard } from '@guards/status.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/user.decorator';
import { UserRole } from '@common/enums/db.enum';
import type { CurrentUserType } from '@common/types/current-user.type';
import { ClinicalService } from './clinical.service';
import { StartSessionDto } from './dto/start-session.dto';
import { UploadLabResultDto } from './dto/upload-lab-result.dto';
import { UploadImagingResultDto } from './dto/upload-imaging-result.dto';
import { LabSessionGuard } from './guards/lab-session.guard';
import { ImagingSessionGuard } from './guards/imaging-session.guard';
import { CurrentLabSession } from './decorators/current-lab-session.decorator';
import { CurrentImagingSession } from './decorators/current-imaging-session.decorator';
import type {
	ImagingSessionTokenPayload,
	LabSessionTokenPayload,
} from './types/diagnostic-session.type';

const IMAGING_RESULT_FILE_LIMIT_BYTES = 50 * 1024 * 1024;

function imagingResultFileFilter(
	req: any,
	file: Express.Multer.File,
	cb: (error: any, acceptFile: boolean) => void,
) {
	const mime = file.mimetype;
	const ext = path.extname(file.originalname).toLowerCase();

	if (mime === 'application/dicom' || mime === 'application/dicom+json') {
		return cb(null, true);
	}

	if (mime === 'application/octet-stream' && ext === '.dcm') {
		return cb(null, true);
	}

	return multerFileFilter(req, file, cb);
}

@Controller('api/v1/diagnostic')
export class DiagnosticController {
	constructor(private readonly clinicalService: ClinicalService) {}

	@Post('lab/sessions')
	@UseGuards(AuthGuard, RoleGuard, StatusGuard)
	@Roles(UserRole.LAB)
	async startLabSession(
		@CurrentUser() user: CurrentUserType,
		@Body() dto: StartSessionDto,
	) {
		return await this.clinicalService.startLabSession(user.userId, dto);
	}

	@Post('imaging/sessions')
	@UseGuards(AuthGuard, RoleGuard, StatusGuard)
	@Roles(UserRole.IMAGING_CENTER)
	async startImagingSession(
		@CurrentUser() user: CurrentUserType,
		@Body() dto: StartSessionDto,
	) {
		return await this.clinicalService.startImagingSession(user.userId, dto);
	}

	@Get('lab/sessions/:sessionId/order-view')
	@UseGuards(LabSessionGuard)
	async getLabOrderView(
		@Param('sessionId', ParseUUIDPipe) _sessionId: string,
		@CurrentLabSession() session: LabSessionTokenPayload,
	) {
		return await this.clinicalService.getLabOrderView(session);
	}

	@Get('imaging/sessions/:sessionId/order-view')
	@UseGuards(ImagingSessionGuard)
	async getImagingOrderView(
		@Param('sessionId', ParseUUIDPipe) _sessionId: string,
		@CurrentImagingSession() session: ImagingSessionTokenPayload,
	) {
		return await this.clinicalService.getImagingOrderView(session);
	}

	@Post('lab/sessions/:sessionId/results')
	@UseGuards(LabSessionGuard)
	@HttpCode(HttpStatus.OK)
	@UseInterceptors(
		FilesInterceptor('labResult', 10, {
			storage: multerStorage,
			limits: multerLimits,
			fileFilter: multerFileFilter,
		}),
	)
	async uploadLabResults(
		@Param('sessionId', ParseUUIDPipe) _sessionId: string,
		@CurrentLabSession() session: LabSessionTokenPayload,
		@Body() dto: UploadLabResultDto,
		@UploadedFiles() files: Express.Multer.File[],
	) {
		if (!files || files.length === 0) {
			throw new BadRequestException('No files uploaded.');
		}

		return await this.clinicalService.uploadLabResults(session, dto, files);
	}

	@Post('imaging/sessions/:sessionId/results')
	@UseGuards(ImagingSessionGuard)
	@HttpCode(HttpStatus.OK)
	@UseInterceptors(
		FilesInterceptor('imagingResult', 10, {
			storage: multerStorage,
			limits: { fileSize: IMAGING_RESULT_FILE_LIMIT_BYTES },
			fileFilter: imagingResultFileFilter,
		}),
	)
	async uploadImagingResults(
		@Param('sessionId', ParseUUIDPipe) _sessionId: string,
		@CurrentImagingSession() session: ImagingSessionTokenPayload,
		@Body() dto: UploadImagingResultDto,
		@UploadedFiles() files: Express.Multer.File[],
	) {
		if (!files || files.length === 0) {
			throw new BadRequestException('No files uploaded.');
		}

		return await this.clinicalService.uploadImagingResults(session, dto, files);
	}
}
