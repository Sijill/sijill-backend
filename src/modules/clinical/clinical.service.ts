import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
	StreamableFile,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import {
	AccessStatus,
	AccessType,
	OrderStatus,
	UserRole,
} from '@common/enums/db.enum';
import { generateOtp } from '@helpers/crypto.helper';
import { ClinicalRepository } from './clinical.repository';
import { GenerateTokenDto, ClinicalEntityType } from './dto/generate-token.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { UpdateVitalsDto } from './dto/update-vitals.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { UploadLabResultDto } from './dto/upload-lab-result.dto';
import { UploadImagingResultDto } from './dto/upload-imaging-result.dto';
import type {
	ClinicalSessionContext,
	ClinicalSessionTokenPayload,
} from './types/clinical-session.type';
import type {
	ImagingSessionTokenPayload,
	LabSessionTokenPayload,
} from './types/diagnostic-session.type';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import * as path from 'path';
import type { Response } from 'express';

@Injectable()
export class ClinicalService {
	constructor(
		private readonly clinicalRepository: ClinicalRepository,
		private readonly logger: PinoLogger,
	) {
		this.logger.setContext(ClinicalService.name);
	}

	async generatePermissionToken(patientUserId: string, dto: GenerateTokenDto) {
		try {
			if (dto.entityType !== ClinicalEntityType.HEALTHCARE_PROVIDER) {
				throw new BadRequestException(
					'Only healthcare provider tokens can be generated from this endpoint.',
				);
			}

			const patient =
				await this.clinicalRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const accessType = this.resolveRequestedAccessType(dto);
			const expiresAt = new Date(Date.now() + dto.expiresInMinutes * 60 * 1000);

			for (let attempt = 0; attempt < 5; attempt += 1) {
				const code = generateOtp(6);
				const codeHash = this.hashPermissionCode(code);

				try {
					const result = await this.clinicalRepository.createPermissionToken({
						patientId: patient.id,
						codeHash,
						entityType: this.mapEntityTypeToUserRole(dto.entityType),
						accessType,
						expiresAt,
					});

					const row = result.rows[0];
					return {
						tokenId: row.id,
						code,
						entityType: row.entity_type,
						accessType: row.access_type,
						expiresAt: row.expires_at,
					};
				} catch (error: any) {
					if (error.code === '23505') {
						continue;
					}

					throw error;
				}
			}

			throw new InternalServerErrorException(
				'Unable to generate a unique permission token.',
			);
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to generate permission token.',
			);
		}
	}

	async listActiveLabOrders(patientUserId: string) {
		try {
			const patient =
				await this.clinicalRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const rows = await this.clinicalRepository.listActiveLabOrdersForPatient(
				patient.id,
			);

			return {
				orders: rows.map((row) => ({
					orderId: row.order_id,
					orderType: row.order_type,
					orderStatus: row.order_status,
					orderedAt: row.ordered_at,
					orderedBy: row.ordered_by,
					orderedBySpecialization: row.ordered_by_specialization,
					labOrder: {
						testType: row.test_type,
						specimenType: row.specimen_type,
						priority: row.priority,
						fastingRequired: row.fasting_required,
						clinicalIndication: row.clinical_indication,
					},
				})),
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load active laboratory orders.',
			);
		}
	}

	async listActiveImagingOrders(patientUserId: string) {
		try {
			const patient =
				await this.clinicalRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const rows =
				await this.clinicalRepository.listActiveImagingOrdersForPatient(
					patient.id,
				);

			return {
				orders: rows.map((row) => ({
					orderId: row.order_id,
					orderType: row.order_type,
					orderStatus: row.order_status,
					orderedAt: row.ordered_at,
					orderedBy: row.ordered_by,
					orderedBySpecialization: row.ordered_by_specialization,
					imagingOrder: {
						imagingType: row.imaging_type,
						bodyPart: row.body_part,
						priority: row.priority,
						contrastUsed: row.contrast_used,
						clinicalIndication: row.clinical_indication,
					},
				})),
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load active imaging orders.',
			);
		}
	}

	async generateLabOrderPermissionToken(
		patientUserId: string,
		orderId: string,
	) {
		return await this.generateDiagnosticOrderPermissionToken(
			patientUserId,
			orderId,
			UserRole.LAB,
		);
	}

	async generateImagingOrderPermissionToken(
		patientUserId: string,
		orderId: string,
	) {
		return await this.generateDiagnosticOrderPermissionToken(
			patientUserId,
			orderId,
			UserRole.IMAGING_CENTER,
		);
	}

	async listActivePermissionTokens(patientUserId: string) {
		try {
			const patient =
				await this.clinicalRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const rows = await this.clinicalRepository.listActivePermissionTokens(
				patient.id,
			);

			return {
				tokens: rows.map((row) => ({
					tokenId: row.token_id,
					entityType: row.entity_type,
					accessType: row.access_type,
					expiresAt: row.expires_at,
					createdAt: row.created_at,
					wasUsed: row.was_used,
				})),
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load active permission tokens.',
			);
		}
	}

	private async generateDiagnosticOrderPermissionToken(
		patientUserId: string,
		orderId: string,
		entityType: UserRole.LAB | UserRole.IMAGING_CENTER,
	) {
		try {
			const patient =
				await this.clinicalRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const order =
				entityType === UserRole.LAB
					? await this.clinicalRepository.getLabOrderForPatient(
							patient.id,
							orderId,
						)
					: await this.clinicalRepository.getImagingOrderForPatient(
							patient.id,
							orderId,
						);

			if (!order) {
				throw new NotFoundException(
					'Medical order not found for this patient.',
				);
			}

			if (
				order.order_status === OrderStatus.COMPLETED ||
				order.order_status === OrderStatus.CANCELLED
			) {
				throw new ForbiddenException(
					'Permission tokens can only be generated for active medical orders.',
				);
			}

			const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

			for (let attempt = 0; attempt < 5; attempt += 1) {
				const code = generateOtp(6);
				const codeHash = this.hashPermissionCode(code);

				try {
					const result = await this.clinicalRepository.createPermissionToken({
						patientId: patient.id,
						medicalOrderId: orderId,
						codeHash,
						entityType,
						accessType: AccessType.READ_WRITE,
						expiresAt,
					});

					const row = result.rows[0];
					return {
						tokenId: row.id,
						code,
						entityType: row.entity_type,
						accessType: row.access_type,
						expiresAt: row.expires_at,
						medicalOrderId: orderId,
					};
				} catch (error: any) {
					if (error.code === '23505') {
						continue;
					}

					throw error;
				}
			}

			throw new InternalServerErrorException(
				'Unable to generate a unique permission token.',
			);
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to generate permission token.',
			);
		}
	}

	async revokePermissionToken(patientUserId: string, tokenId: string) {
		try {
			const patient =
				await this.clinicalRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const token =
				await this.clinicalRepository.getPermissionTokenById(tokenId);
			if (!token) {
				throw new NotFoundException('Permission token not found.');
			}

			if (token.patient_id !== patient.id) {
				throw new ForbiddenException(
					'You are not allowed to revoke this permission token.',
				);
			}

			if (
				token.status === AccessStatus.REVOKED ||
				token.status === AccessStatus.EXPIRED
			) {
				throw new ForbiddenException('This token is no longer active.');
			}

			const revoked =
				await this.clinicalRepository.revokePermissionToken(tokenId);

			return {
				success: true,
				message: 'Token revoked successfully',
				tokenId: revoked.id,
				revokedAt: revoked.revoked_at,
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to revoke permission token.',
			);
		}
	}

	async startSession(hcpUserId: string, dto: StartSessionDto) {
		try {
			const hcp =
				await this.clinicalRepository.getHealthcareProviderByUserId(hcpUserId);

			if (!hcp) {
				throw new NotFoundException('Healthcare provider profile not found.');
			}

			const redeemed = await this.clinicalRepository.redeemPermissionToken(
				this.hashPermissionCode(dto.code),
				hcpUserId,
			);

			const clinicalSessionToken = this.signSessionToken(
				{
					type: 'CLINICAL_SESSION',
					sessionId: redeemed.sessionId,
					permissionTokenId: redeemed.permissionTokenId,
					userId: hcpUserId,
					patientId: redeemed.patientId,
					accessType: redeemed.accessType,
					role: UserRole.HEALTHCARE_PROVIDER,
				},
				new Date(redeemed.expiresAt),
			);

			return {
				sessionId: redeemed.sessionId,
				clinicalSessionToken,
				accessType: redeemed.accessType,
				expiresAt: redeemed.expiresAt,
				patient: redeemed.patient,
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to start clinical session.',
			);
		}
	}

	async startLabSession(labUserId: string, dto: StartSessionDto) {
		try {
			const lab =
				await this.clinicalRepository.getLaboratoryByUserId(labUserId);
			if (!lab) {
				throw new NotFoundException('Laboratory profile not found.');
			}

			const redeemed = await this.clinicalRepository.redeemLabPermissionToken(
				this.hashPermissionCode(dto.code),
				labUserId,
			);

			const labSessionToken = this.signSessionToken(
				{
					type: 'LAB_SESSION',
					sessionId: redeemed.sessionId,
					permissionTokenId: redeemed.permissionTokenId,
					userId: labUserId,
					patientId: redeemed.patientId,
					medicalOrderId: redeemed.medicalOrderId,
					accessType: redeemed.accessType,
					role: UserRole.LAB,
				},
				new Date(redeemed.expiresAt),
			);

			return {
				sessionId: redeemed.sessionId,
				labSessionToken,
				medicalOrderId: redeemed.medicalOrderId,
				expiresAt: redeemed.expiresAt,
				patient: redeemed.patient,
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to start lab session.');
		}
	}

	async startImagingSession(imagingUserId: string, dto: StartSessionDto) {
		try {
			const center =
				await this.clinicalRepository.getImagingCenterByUserId(imagingUserId);
			if (!center) {
				throw new NotFoundException('Imaging center profile not found.');
			}

			const redeemed =
				await this.clinicalRepository.redeemImagingPermissionToken(
					this.hashPermissionCode(dto.code),
					imagingUserId,
				);

			const imagingSessionToken = this.signSessionToken(
				{
					type: 'IMAGING_SESSION',
					sessionId: redeemed.sessionId,
					permissionTokenId: redeemed.permissionTokenId,
					userId: imagingUserId,
					patientId: redeemed.patientId,
					medicalOrderId: redeemed.medicalOrderId,
					accessType: redeemed.accessType,
					role: UserRole.IMAGING_CENTER,
				},
				new Date(redeemed.expiresAt),
			);

			return {
				sessionId: redeemed.sessionId,
				imagingSessionToken,
				medicalOrderId: redeemed.medicalOrderId,
				expiresAt: redeemed.expiresAt,
				patient: redeemed.patient,
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to start imaging session.',
			);
		}
	}

	async getLabOrderView(payload: LabSessionTokenPayload) {
		try {
			const session = await this.assertValidLabSession(payload);

			const [patientMedicalIdentity, order] = await Promise.all([
				this.clinicalRepository.getMedicalIdentity(session.patientId),
				this.clinicalRepository.getLabOrderDetailsForPatient(
					session.patientId,
					session.medicalOrderId,
				),
			]);

			if (!order) {
				throw new NotFoundException('Lab order not found for this patient.');
			}

			return {
				patientMedicalIdentity,
				labOrder: {
					orderId: order.order_id,
					orderStatus: order.order_status,
					orderedAt: order.ordered_at,
					orderedBy: order.ordered_by,
					testType: order.test_type,
					specimenType: order.specimen_type,
					priority: order.priority,
					fastingRequired: order.fasting_required,
					clinicalIndication: order.clinical_indication,
				},
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to load lab order view.');
		}
	}

	async getImagingOrderView(payload: ImagingSessionTokenPayload) {
		try {
			const session = await this.assertValidImagingSession(payload);

			const [patientMedicalIdentity, order] = await Promise.all([
				this.clinicalRepository.getMedicalIdentity(session.patientId),
				this.clinicalRepository.getImagingOrderDetailsForPatient(
					session.patientId,
					session.medicalOrderId,
				),
			]);

			if (!order) {
				throw new NotFoundException(
					'Imaging order not found for this patient.',
				);
			}

			return {
				patientMedicalIdentity,
				imagingOrder: {
					orderId: order.order_id,
					orderStatus: order.order_status,
					orderedAt: order.ordered_at,
					orderedBy: order.ordered_by,
					imagingType: order.imaging_type,
					bodyPart: order.body_part,
					priority: order.priority,
					contrastUsed: order.contrast_used,
					clinicalIndication: order.clinical_indication,
				},
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load imaging order view.',
			);
		}
	}

	async uploadLabResults(
		payload: LabSessionTokenPayload,
		dto: UploadLabResultDto,
		files: Express.Multer.File[],
	) {
		try {
			const session = await this.assertValidLabSession(payload);

			if (!files || files.length === 0) {
				throw new BadRequestException(
					'At least one lab result attachment must be uploaded.',
				);
			}

			let parsedResultData: unknown;
			try {
				parsedResultData = JSON.parse(dto.resultData);
			} catch {
				throw new BadRequestException('resultData must be valid JSON.');
			}

			if (typeof parsedResultData !== 'object' || parsedResultData === null) {
				throw new BadRequestException(
					'resultData must be a JSON object or array.',
				);
			}

			const submission = await this.clinicalRepository.submitLabResult({
				patientId: session.patientId,
				orderId: session.medicalOrderId,
				labId: session.labId,
				uploadedByUserId: session.labUserId,
				resultData: parsedResultData,
				additionalNotes: dto.additionalNotes,
				files,
			});

			return {
				success: true,
				message: 'Lab results submitted successfully.',
				orderId: session.medicalOrderId,
				resultId: submission.resultId,
				documentIds: submission.documentIds,
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to submit lab results.');
		}
	}

	async uploadImagingResults(
		payload: ImagingSessionTokenPayload,
		dto: UploadImagingResultDto,
		files: Express.Multer.File[],
	) {
		try {
			const session = await this.assertValidImagingSession(payload);

			if (!files || files.length === 0) {
				throw new BadRequestException(
					'At least one imaging result attachment must be uploaded.',
				);
			}

			const submission = await this.clinicalRepository.submitImagingResult({
				patientId: session.patientId,
				orderId: session.medicalOrderId,
				imagingCenterId: session.imagingCenterId,
				uploadedByUserId: session.imagingUserId,
				studyDescription: dto.studyDescription,
				findings: dto.findings,
				files,
			});

			return {
				success: true,
				message: 'Imaging results submitted successfully.',
				orderId: session.medicalOrderId,
				resultId: submission.resultId,
				documentIds: submission.documentIds,
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to submit imaging results.',
			);
		}
	}

	async getMedicalIdentity(payload: ClinicalSessionTokenPayload) {
		try {
			const session = await this.assertValidSession(payload);
			const identity = await this.clinicalRepository.getMedicalIdentity(
				session.patientId,
			);

			return {
				...identity,
				basicInfo: {
					...identity.basicInfo,
					profilePictureUrl: identity.basicInfo.profilePictureUrl
						? `/api/v1/clinical/sessions/${session.sessionId}/profile-picture`
						: null,
				},
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load medical identity.',
			);
		}
	}

	async updateVitals(
		payload: ClinicalSessionTokenPayload,
		dto: UpdateVitalsDto,
	) {
		try {
			const session = await this.assertValidSession(payload);
			this.assertWritableAccess(session.accessType);

			if (
				dto.bloodType === undefined &&
				dto.weightKg === undefined &&
				dto.heightCm === undefined
			) {
				throw new BadRequestException(
					'At least one of bloodType, weightKg, or heightCm must be provided.',
				);
			}

			const currentVitals = await this.clinicalRepository.getPatientVitals(
				session.patientId,
			);

			if (!currentVitals) {
				throw new NotFoundException('Patient not found.');
			}

			const updatedFields: string[] = [];

			if (dto.bloodType !== undefined) {
				if (currentVitals.blood_type !== null) {
					throw new BadRequestException(
						'bloodType is already set and cannot be overwritten.',
					);
				}
				updatedFields.push('bloodType');
			}

			if (dto.weightKg !== undefined) {
				if (currentVitals.weight_kg !== null) {
					throw new BadRequestException(
						'weightKg is already set and cannot be overwritten.',
					);
				}
				updatedFields.push('weightKg');
			}

			if (dto.heightCm !== undefined) {
				if (currentVitals.height_cm !== null) {
					throw new BadRequestException(
						'heightCm is already set and cannot be overwritten.',
					);
				}
				updatedFields.push('heightCm');
			}

			const updated = await this.clinicalRepository.updatePatientVitals(
				session.patientId,
				dto,
			);

			return {
				success: true,
				updatedFields,
				bloodType: updated.blood_type,
				weightKg: updated.weight_kg,
				heightCm: updated.height_cm,
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to update patient vitals.',
			);
		}
	}

	async getMedicalHistory(
		payload: ClinicalSessionTokenPayload,
		page: number,
		limit: number,
	) {
		try {
			const session = await this.assertValidSession(payload);
			this.assertReadableHistoryAccess(session.accessType);

			const result = await this.clinicalRepository.getMedicalHistory(
				session.patientId,
				page,
				limit,
			);

			return {
				data: result.data,
				pagination: {
					total: result.total,
					page,
					limit,
					totalPages: result.total === 0 ? 0 : Math.ceil(result.total / limit),
				},
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to load medical history.');
		}
	}

	async getEncounterDetail(
		payload: ClinicalSessionTokenPayload,
		encounterId: string,
	) {
		try {
			const session = await this.assertValidSession(payload);
			this.assertReadableHistoryAccess(session.accessType);

			const encounterMeta =
				await this.clinicalRepository.getEncounterMeta(encounterId);

			if (!encounterMeta) {
				throw new NotFoundException('Encounter not found.');
			}

			if (encounterMeta.patient_id !== session.patientId) {
				throw new ForbiddenException(
					'This encounter does not belong to the current patient session.',
				);
			}

			const detail =
				await this.clinicalRepository.getEncounterDetail(encounterId);

			const sessionId = session.sessionId;

			const orders = detail.orders.map((order: any) => ({
				...order,
				labOrder: order.labOrder
					? {
							...order.labOrder,
							result: order.labOrder.result
								? {
										...order.labOrder.result,
										documents: (order.labOrder.result.documents ?? []).map(
											(doc: any) => ({
												...doc,
												url: `/api/v1/clinical/sessions/${sessionId}/documents/${doc.documentId}`,
											}),
										),
									}
								: null,
						}
					: null,
				imagingOrder: order.imagingOrder
					? {
							...order.imagingOrder,
							result: order.imagingOrder.result
								? {
										...order.imagingOrder.result,
										documents: (order.imagingOrder.result.documents ?? []).map(
											(doc: any) => ({
												...doc,
												url: `/api/v1/clinical/sessions/${sessionId}/documents/${doc.documentId}`,
											}),
										),
									}
								: null,
						}
					: null,
			}));

			return {
				encounterId: encounterMeta.encounter_id,
				hcpFullName: encounterMeta.hcp_full_name,
				hcpSpecialization: encounterMeta.hcp_specialization,
				encounterDate: encounterMeta.encounter_date,
				locationAddress: encounterMeta.location_address,
				nextAppointmentDate: encounterMeta.next_appointment_date,
				appointmentNotes: encounterMeta.appointment_notes,
				symptoms: detail.symptoms,
				diagnoses: detail.diagnoses,
				medications: detail.medications,
				orders,
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load encounter detail.',
			);
		}
	}

	async createEncounter(
		payload: ClinicalSessionTokenPayload,
		dto: CreateEncounterDto,
	) {
		try {
			const session = await this.assertValidSession(payload);
			this.assertWritableAccess(session.accessType);
			this.validateEncounterPayload(dto);

			return await this.clinicalRepository.createEncounter(session, dto);
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to create encounter.');
		}
	}

	private async assertValidSession(payload: ClinicalSessionTokenPayload) {
		const session = await this.clinicalRepository.validateClinicalSession(
			payload.sessionId,
			payload.userId,
		);

		if (
			session.patientId !== payload.patientId ||
			session.permissionTokenId !== payload.permissionTokenId ||
			session.accessType !== payload.accessType
		) {
			throw new ForbiddenException(
				'Clinical session token does not match the current session state.',
			);
		}

		return session;
	}

	private async assertValidLabSession(payload: LabSessionTokenPayload) {
		const session = await this.clinicalRepository.validateLabSession(
			payload.sessionId,
			payload.userId,
		);

		if (
			session.patientId !== payload.patientId ||
			session.permissionTokenId !== payload.permissionTokenId ||
			session.medicalOrderId !== payload.medicalOrderId ||
			session.accessType !== payload.accessType
		) {
			throw new ForbiddenException(
				'Lab session token does not match the current session state.',
			);
		}

		return session;
	}

	private async assertValidImagingSession(payload: ImagingSessionTokenPayload) {
		const session = await this.clinicalRepository.validateImagingSession(
			payload.sessionId,
			payload.userId,
		);

		if (
			session.patientId !== payload.patientId ||
			session.permissionTokenId !== payload.permissionTokenId ||
			session.medicalOrderId !== payload.medicalOrderId ||
			session.accessType !== payload.accessType
		) {
			throw new ForbiddenException(
				'Imaging session token does not match the current session state.',
			);
		}

		return session;
	}

	private resolveRequestedAccessType(dto: GenerateTokenDto) {
		if (dto.entityType === ClinicalEntityType.HEALTHCARE_PROVIDER) {
			if (!dto.accessType) {
				throw new BadRequestException(
					'accessType is required for healthcare provider tokens.',
				);
			}

			return dto.accessType;
		}

		if (dto.accessType) {
			throw new BadRequestException(
				'accessType must not be provided for lab or imaging center tokens.',
			);
		}

		return AccessType.WRITE_ONLY;
	}

	private mapEntityTypeToUserRole(
		entityType: ClinicalEntityType,
	): UserRole.HEALTHCARE_PROVIDER | UserRole.LAB | UserRole.IMAGING_CENTER {
		switch (entityType) {
			case ClinicalEntityType.HEALTHCARE_PROVIDER:
				return UserRole.HEALTHCARE_PROVIDER;
			case ClinicalEntityType.LAB:
				return UserRole.LAB;
			case ClinicalEntityType.IMAGING_CENTER:
				return UserRole.IMAGING_CENTER;
		}
	}

	private assertReadableHistoryAccess(accessType: AccessType) {
		if (accessType === AccessType.WRITE_ONLY) {
			throw new ForbiddenException(
				'This clinical session does not allow medical history access.',
			);
		}
	}

	private assertWritableAccess(accessType: AccessType) {
		if (accessType === AccessType.READ_ONLY) {
			throw new ForbiddenException(
				'This clinical session does not allow write operations.',
			);
		}
	}

	private validateEncounterPayload(dto: CreateEncounterDto) {
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);

		for (const medication of dto.medications ?? []) {
			if (new Date(medication.startDate) < todayStart) {
				throw new BadRequestException(
					'Medication startDate cannot be earlier than today.',
				);
			}

			if (
				medication.endDate &&
				new Date(medication.endDate) < new Date(medication.startDate)
			) {
				throw new BadRequestException(
					'Medication endDate cannot be before startDate.',
				);
			}
		}
	}

	private signSessionToken(payload: Record<string, unknown>, expiresAt: Date) {
		const secret =
			process.env.JWT_CLINICAL_SECRET ||
			process.env.JWT_ACCESS_SECRET ||
			'sijill-clinical-secret';

		const expiresInSeconds = Math.max(
			1,
			Math.floor((expiresAt.getTime() - Date.now()) / 1000),
		);

		return jwt.sign(payload, secret, { expiresIn: expiresInSeconds });
	}

	private hashPermissionCode(code: string) {
		const secret =
			process.env.JWT_CLINICAL_SECRET ||
			process.env.JWT_ACCESS_SECRET ||
			'sijill-clinical-secret';

		return crypto.createHmac('sha256', secret).update(code).digest('hex');
	}

	async getClinicalDocument(
		payload: ClinicalSessionTokenPayload,
		documentId: string,
		res: Response,
	): Promise<StreamableFile> {
		const session = await this.assertValidSession(payload);

		const document = await this.clinicalRepository.getClinicalDocument(
			documentId,
			session.patientId,
		);

		if (!document) {
			throw new NotFoundException('Document not found.');
		}

		const fullPath = path.resolve(process.cwd(), document.file_path);

		try {
			await stat(fullPath);
		} catch {
			throw new NotFoundException('Document file not found on disk.');
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

		return new StreamableFile(createReadStream(fullPath));
	}

	async getProfilePicture(
		payload: ClinicalSessionTokenPayload,
		res: Response,
	): Promise<StreamableFile> {
		const session = await this.assertValidSession(payload);

		const profilePicture =
			await this.clinicalRepository.getPatientProfilePicture(session.patientId);

		if (!profilePicture) {
			throw new NotFoundException('No profile picture set.');
		}

		const fullPath = path.resolve(process.cwd(), profilePicture.filePath);

		try {
			await stat(fullPath);
		} catch {
			throw new NotFoundException('Profile picture file not found on disk.');
		}

		res.set({
			'Content-Type': profilePicture.mimeType,
			'Content-Disposition': `inline; filename="${profilePicture.fileName}"`,
		});

		return new StreamableFile(createReadStream(fullPath));
	}

	private rethrowKnown(error: any): never | void {
		if (
			error instanceof BadRequestException ||
			error instanceof ForbiddenException ||
			error instanceof NotFoundException ||
			error instanceof InternalServerErrorException
		) {
			throw error;
		}
	}
}
