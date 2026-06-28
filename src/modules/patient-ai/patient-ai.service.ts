import {
	Injectable,
	NotFoundException,
	BadRequestException,
	InternalServerErrorException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PatientAIRepository } from './patient-ai.repository';
import { PatientAIChatService } from './patient-ai-chat.service';

@Injectable()
export class PatientAIService {
	private readonly maxActiveSessions = 50;

	constructor(
		private readonly repository: PatientAIRepository,
		private readonly chatService: PatientAIChatService,
		private readonly logger: PinoLogger,
	) {
		this.logger.setContext(PatientAIService.name);
	}

	async createSession(patientUserId: string, title?: string) {
		try {
			const patientId =
				await this.repository.getPatientIdByUserId(patientUserId);
			if (!patientId) {
				throw new NotFoundException('Patient profile not found.');
			}

			const sessions = await this.repository.listSessions(patientId, 'ACTIVE');
			if (sessions.length >= this.maxActiveSessions) {
				throw new BadRequestException(
					`Maximum of ${this.maxActiveSessions} active sessions reached. Please archive an existing session first.`,
				);
			}

			const session = await this.repository.createSession(patientId, title);

			return { session };
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to create chat session.');
		}
	}

	async listSessions(patientUserId: string, status?: string) {
		try {
			const patientId =
				await this.repository.getPatientIdByUserId(patientUserId);
			if (!patientId) {
				throw new NotFoundException('Patient profile not found.');
			}

			const sessions = await this.repository.listSessions(patientId, status);

			return { sessions };
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to list chat sessions.');
		}
	}

	async getSession(patientUserId: string, sessionId: string) {
		try {
			const patientId =
				await this.repository.getPatientIdByUserId(patientUserId);
			if (!patientId) {
				throw new NotFoundException('Patient profile not found.');
			}

			const result = await this.repository.getSessionWithMessages(
				patientId,
				sessionId,
			);

			if (!result) {
				throw new NotFoundException('Chat session not found.');
			}

			return result;
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException(
				'Failed to retrieve chat session.',
			);
		}
	}

	async updateSession(
		patientUserId: string,
		sessionId: string,
		data: { status?: string; title?: string },
	) {
		try {
			const patientId =
				await this.repository.getPatientIdByUserId(patientUserId);
			if (!patientId) {
				throw new NotFoundException('Patient profile not found.');
			}

			if (!data.status && !data.title) {
				throw new BadRequestException(
					'At least one field (status or title) is required.',
				);
			}

			const session = await this.repository.updateSession(
				patientId,
				sessionId,
				data,
			);

			if (!session) {
				throw new NotFoundException('Chat session not found.');
			}

			return { session };
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to update chat session.');
		}
	}

	async deleteSession(patientUserId: string, sessionId: string) {
		try {
			const patientId =
				await this.repository.getPatientIdByUserId(patientUserId);
			if (!patientId) {
				throw new NotFoundException('Patient profile not found.');
			}

			const session = await this.repository.updateSession(
				patientId,
				sessionId,
				{ status: 'ARCHIVED' },
			);

			if (!session) {
				throw new NotFoundException('Chat session not found.');
			}

			return { message: 'Session archived.' };
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to archive chat session.');
		}
	}

	async deleteAllSessions(patientUserId: string) {
		try {
			const patientId =
				await this.repository.getPatientIdByUserId(patientUserId);
			if (!patientId) {
				throw new NotFoundException('Patient profile not found.');
			}

			const deletedCount = await this.repository.deleteAllSessions(patientId);

			return {
				message: `${deletedCount} session(s) deleted.`,
				deletedCount,
			};
		} catch (error) {
			this.rethrowKnown(error);
			this.logger.error(error);
			throw new InternalServerErrorException('Failed to delete chat sessions.');
		}
	}

	async sendMessage(patientUserId: string, sessionId: string, content: string) {
		try {
			const patientId =
				await this.repository.getPatientIdByUserId(patientUserId);
			if (!patientId) {
				throw new NotFoundException('Patient profile not found.');
			}

			const result = await this.chatService.sendMessage(
				patientId,
				sessionId,
				content,
			);

			return result;
		} catch (error) {
			if (
				error instanceof BadRequestException ||
				error instanceof NotFoundException
			) {
				throw error;
			}

			if (
				error instanceof Error &&
				error.message.includes('Chat session not found')
			) {
				throw new NotFoundException('Chat session not found.');
			}

			if (
				error instanceof Error &&
				error.message.includes('maximum of 200 messages')
			) {
				throw new BadRequestException(error.message);
			}

			this.logger.error(error);
			const message =
				error instanceof Error
					? error.message
					: 'An unexpected error occurred.';
			throw new InternalServerErrorException(message);
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
