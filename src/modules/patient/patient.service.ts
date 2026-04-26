import {
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PatientRepository } from './patient.repository';
import { CreateHealthJournalEntryDto } from './dto/create-health-journal-entry.dto';
import { PatientHealthSnapshotService } from './patient-health-snapshot.service';

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

	async listHealthJournalDiagnoses(patientUserId: string) {
		try {
			const patient =
				await this.patientRepository.getPatientByUserId(patientUserId);

			if (!patient) {
				throw new NotFoundException('Patient profile not found.');
			}

			const diagnoses =
				await this.patientRepository.listActiveDiagnosesForJournal(
					patient.id,
				);

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
			const patient = await this.patientRepository.getPatientByUserId(patientUserId);
			if (!patient) throw new NotFoundException('Patient profile not found.');

			return await this.patientRepository.listHealthJournalDiagnosesSummary(patient.id);
		} catch (error) {
			if (error instanceof NotFoundException) throw error;
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to load health journal diagnoses.');
		}
	}

	async listHealthJournalNotes(patientUserId: string, diagnosisId: string) {
		try {
			const patient = await this.patientRepository.getPatientByUserId(patientUserId);
			if (!patient) throw new NotFoundException('Patient profile not found.');

			return await this.patientRepository.listHealthJournalNotes(patient.id, diagnosisId);
		} catch (error) {
			if (error instanceof NotFoundException) throw error;
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to load health journal notes.');
		}
	}
}
