import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { AccessStatus, AccessType, UserRole } from '@common/enums/db.enum';
import { generateOtp } from '@helpers/crypto.helper';
import { ClinicalRepository } from './clinical.repository';
import { GenerateTokenDto, ClinicalEntityType } from './dto/generate-token.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { UpdateVitalsDto } from './dto/update-vitals.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import type {
	ClinicalSessionContext,
	ClinicalSessionTokenPayload,
} from './types/clinical-session.type';

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
				} catch (error) {
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

			const clinicalSessionToken = this.signClinicalSessionToken(
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

	async getMedicalIdentity(payload: ClinicalSessionTokenPayload) {
		try {
			const session = await this.assertValidSession(payload);
			return await this.clinicalRepository.getMedicalIdentity(
				session.patientId,
			);
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
				orders: detail.orders,
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
		for (const medication of dto.medications ?? []) {
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

	private signClinicalSessionToken(
		payload: ClinicalSessionTokenPayload,
		expiresAt: Date,
	) {
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
