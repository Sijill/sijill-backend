import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PatientRepository } from './patient.repository';
import { CreateHealthJournalEntryDto } from './dto/create-health-journal-entry.dto';
import { PatientHealthSnapshotService } from './patient-health-snapshot.service';
import { StreamableFile } from '@nestjs/common';
import { createReadStream } from 'fs';
import { stat as fsStat } from 'fs/promises';
import * as path from 'path';
import type { Response } from 'express';
import { AddEmergencyContactDto } from './dto/add-emergency-contact.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import type {
	PatientHomeReminderCounters,
	PatientHomeScheduleItem,
} from './patient.repository';

@Injectable()
export class PatientService {
	constructor(
		private readonly patientRepository: PatientRepository,
		private readonly patientHealthSnapshotService: PatientHealthSnapshotService,
		private readonly logger: PinoLogger,
	) {
		this.logger.setContext(PatientService.name);
	}

	async getMedicalIdentity(patientUserId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const identity = await this.patientRepository.getMedicalIdentity(
				patient.id,
			);

			return {
				basicInfo: {
					age: identity.basicInfo.age,
					gender: identity.basicInfo.gender,
					bloodType: identity.basicInfo.bloodType,
					weightKg: identity.basicInfo.weightKg,
					heightCm: identity.basicInfo.heightCm,
					bmi: identity.basicInfo.bmi,
				},
				activeDiagnoses: identity.activeDiagnoses.map((row) => ({
					diagnosisId: row.diagnosisId,
					icd11Title: row.icd11Title,
					icd11Code: row.icd11Code,
					diagnosedBy: row.diagnosedBy,
					diagnosedDate: row.diagnosedDate,
				})),
				currentMedications: identity.currentMedications.map((row) => ({
					medicationName: row.medicationName,
					dosageAmount: row.dosageAmount,
					dosageUnit: row.dosageUnit,
					form: row.form,
					frequency: row.frequency,
					startDate: row.startDate,
					endDate: row.endDate,
					prescribedBy: row.prescribedBy,
					prescribedAt: row.prescribedAt,
				})),
				allergies: identity.allergies.map((row) => ({
					allergenName: row.allergenName,
					icd11Title: row.allergenName,
					severity: row.severity,
					reactionDescription: row.reactionDescription,
					diagnosedBy: row.diagnosedBy,
					diagnosedDate: row.diagnosedDate,
				})),
				chronicConditions: identity.chronicConditions.map((row) => ({
					diagnosisId: row.diagnosisId,
					icd11Title: row.icd11Title,
					icd11Code: row.icd11Code,
					diagnosedBy: row.diagnosedBy,
					diagnosedDate: row.diagnosedDate,
				})),
				emergencyContacts: identity.emergencyContacts.map((row) => ({
					contactId: row.contactId,
					contactName: row.contactName,
					relationship: row.relationship,
					phoneNumber: row.phoneNumber,
					isPrimary: row.isPrimary,
				})),
			};
		} catch (error) {
			if (error instanceof NotFoundException) {
				throw error;
			}

			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load patient medical identity.',
			);
		}
	}

	async listMedicalHistory(patientUserId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const encounters = await this.patientRepository.listMedicalHistory(
				patient.id,
			);

			return { encounters };
		} catch (error) {
			if (error instanceof NotFoundException) {
				throw error;
			}

			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load patient medical history.',
			);
		}
	}

	async getMedicalHistoryEncounter(patientUserId: string, encounterId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const encounter =
				await this.patientRepository.getMedicalHistoryEncounter(
					patient.id,
					encounterId,
				);

			if (!encounter) {
				throw new NotFoundException('Encounter not found.');
			}

			return { encounter };
		} catch (error) {
			if (error instanceof NotFoundException) {
				throw error;
			}

			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load patient medical history encounter.',
			);
		}
	}

	async listActiveReminders(patientUserId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			return await this.patientRepository.listActiveReminders(patient.id);
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load active reminders.',
			);
		}
	}

	async getHomeReminderCounters(
		patientUserId: string,
	): Promise<{ counters: PatientHomeReminderCounters }> {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const counters = await this.patientRepository.getHomeReminderCounters(
				patient.id,
			);

			return { counters };
		} catch (error) {
			if (error instanceof NotFoundException) {
				throw error;
			}

			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load reminder counters.',
			);
		}
	}

	async getTodaySchedule(
		patientUserId: string,
	): Promise<{ schedule: PatientHomeScheduleItem[] }> {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const schedule = await this.patientRepository.listTodaySchedule(
				patient.id,
			);

			return { schedule };
		} catch (error) {
			if (error instanceof NotFoundException) {
				throw error;
			}

			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load today schedule.',
			);
		}
	}

	async updateReminder(
		patientUserId: string,
		reminderId: string,
		dto: UpdateReminderDto | undefined,
	) {
		try {
			const reminderUpdate = dto ?? {};

			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const reminder = await this.patientRepository.getReminderForPatient(
				patient.id,
				reminderId,
			);

			if (!reminder) {
				throw new NotFoundException('Reminder not found.');
			}

			const reminderTime =
				reminderUpdate.reminder_time ?? reminderUpdate.reminderTime;
			const customDays = reminderUpdate.custom_days ?? reminderUpdate.customDays;
			const isActive = reminderUpdate.is_active ?? reminderUpdate.isActive;
			const hasTime = reminderTime !== undefined;
			const hasCustomDays =
				reminderUpdate.custom_days !== undefined ||
				reminderUpdate.customDays !== undefined;
			const hasActive = isActive !== undefined;

			if (!hasTime && !hasCustomDays && !hasActive) {
				throw new BadRequestException(
					'At least one reminder update field is required.',
				);
			}

			if (
				(hasTime || hasCustomDays) &&
				reminder.reminder_type !== 'MEDICATION'
			) {
				throw new BadRequestException(
					'Only medication reminders can customize reminder_time or custom_days.',
				);
			}

			if (hasActive) {
				if (isActive !== false) {
					throw new BadRequestException(
						'Only dismissing a reminder with is_active=false is supported.',
					);
				}

				if (reminder.reminder_type !== 'MEDICAL_ORDER') {
					throw new BadRequestException(
						'Only medical order reminders can be dismissed by the patient.',
					);
				}
			}

			return await this.patientRepository.updateReminder(
				patient.id,
				reminderId,
				{
					reminderTime,
					customDays,
					hasCustomDays,
					isActive,
				},
			);
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to update reminder.');
		}
	}

	async listNotifications(patientUserId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			return await this.patientRepository.listNotifications(patient.user_id);
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to load notifications.');
		}
	}

	async consumePendingNotifications(patientUserId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			return await this.patientRepository.consumePendingNotifications(
				patient.user_id,
			);
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load pending notifications.',
			);
		}
	}

	async markNotificationRead(patientUserId: string, notificationId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			return await this.patientRepository.markNotificationRead(
				patient.user_id,
				notificationId,
			);
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to mark notification as read.',
			);
		}
	}

	async listHealthJournalDiagnoses(patientUserId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const diagnoses =
				await this.patientRepository.listActiveDiagnosesForJournal(patient.id);

			return { diagnoses };
		} catch (error) {
			if (error instanceof NotFoundException) {
				throw error;
			}

			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load active diagnoses for the health journal.',
			);
		}
	}

	async createHealthJournalEntry(
		patientUserId: string,
		dto: CreateHealthJournalEntryDto,
	) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const entry = await this.patientRepository.createHealthJournalEntry(
				patient.id,
				dto,
			);

			let healthSnapshot =
				this.patientHealthSnapshotService.createUnavailableSnapshot(
					'The AI health snapshot was not generated.',
				);

			try {
				const context =
					await this.patientRepository.getHealthJournalSnapshotContext(
						patient.id,
						entry.diagnosisId,
						entry.noteId,
					);

				healthSnapshot =
					await this.patientHealthSnapshotService.generateHealthSnapshot({
						context,
						currentNote: entry,
					});
			} catch (error) {
				this.logger.error(
					error,
					'Failed to build the AI health snapshot context.',
				);
				healthSnapshot =
					this.patientHealthSnapshotService.createUnavailableSnapshot(
						'The AI health snapshot context could not be prepared.',
					);
			}

			return {
				entry,
				healthSnapshot,
			};
		} catch (error) {
			if (error instanceof NotFoundException) {
				throw error;
			}

			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to create the health journal entry.',
			);
		}
	}

	async listHealthJournalDiagnosesSummary(patientUserId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);
			if (!patient) throw new NotFoundException('Patient profile not found.');

			return await this.patientRepository.listHealthJournalDiagnosesSummary(
				patient.id,
			);
		} catch (error) {
			if (error instanceof NotFoundException) throw error;
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load health journal diagnoses.',
			);
		}
	}

	async listHealthJournalNotes(patientUserId: string, diagnosisId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);
			if (!patient) throw new NotFoundException('Patient profile not found.');

			return await this.patientRepository.listHealthJournalNotes(
				patient.id,
				diagnosisId,
			);
		} catch (error) {
			if (error instanceof NotFoundException) throw error;
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to load health journal notes.',
			);
		}
	}

	async uploadProfilePicture(patientUserId: string, file: Express.Multer.File) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);
			if (!patient) throw new NotFoundException('Patient profile not found.');

			await this.patientRepository.saveProfilePicture(patient.user_id, file);

			return { message: 'Profile picture uploaded successfully.' };
		} catch (error) {
			if (error instanceof NotFoundException) throw error;
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to upload profile picture.',
			);
		}
	}

	async getProfilePicture(
		patientUserId: string,
		res: Response,
	): Promise<StreamableFile> {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);
			if (!patient) throw new NotFoundException('Patient profile not found.');

			const document = await this.patientRepository.getLatestProfilePicture(
				patient.user_id,
			);

			if (!document) {
				throw new NotFoundException('No profile picture set.');
			}

			const fullPath = path.resolve(process.cwd(), document.filePath);

			try {
				await fsStat(fullPath);
			} catch {
				throw new NotFoundException('Profile picture file not found on disk.');
			}

			res.set({
				'Content-Type': document.mimeType,
				'Content-Disposition': `inline; filename="${document.fileName}"`,
			});

			return new StreamableFile(createReadStream(fullPath));
		} catch (error) {
			if (error instanceof NotFoundException) throw error;
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to retrieve profile picture.',
			);
		}
	}

	async addEmergencyContact(
		patientUserId: string,
		dto: AddEmergencyContactDto,
	) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);
			if (!patient) throw new NotFoundException('Patient profile not found.');

			const contact = await this.patientRepository.addEmergencyContact(
				patient.id,
				dto,
			);
			return { contact };
		} catch (error) {
			if (error instanceof NotFoundException) throw error;
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to add emergency contact.',
			);
		}
	}

	async removeEmergencyContact(patientUserId: string, contactId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);
			if (!patient) throw new NotFoundException('Patient profile not found.');

			await this.patientRepository.removeEmergencyContact(
				patient.id,
				contactId,
			);
			return { message: 'Emergency contact removed.' };
		} catch (error) {
			if (error instanceof NotFoundException) throw error;
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to remove emergency contact.',
			);
		}
	}

	private rethrowKnown(error: any): never | void {
		if (
			error instanceof BadRequestException ||
			error instanceof NotFoundException ||
			error instanceof InternalServerErrorException
		) {
			throw error;
		}
	}
}
