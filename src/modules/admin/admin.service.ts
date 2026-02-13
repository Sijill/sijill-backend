import {
	Injectable,
	InternalServerErrorException,
	NotFoundException,
	BadRequestException,
	ConflictException,
} from '@nestjs/common';

import { VerificationQueueResponse } from './interfaces/verification-queue.interface';

import { PinoLogger } from 'nestjs-pino';
import { AdminRepository } from './admin.repository';
import { VerificationQueueQueryDto } from './dto/verification-queue-query.dto';
import {
	VerificationDecisionDto,
	VerificationDecision,
} from './dto/verification-decision.dto';
import { EmailService } from '@email/email.service';
import { DatabaseService } from '@db/database.service';
import { constructApprovalEmailTemplate } from '@email/templates/approva-email.template';
import { constructRejectionEmailTemplate } from '@email/templates/rejection-email.template';

@Injectable()
export class AdminService {
	constructor(
		private readonly adminRepository: AdminRepository,
		private readonly logger: PinoLogger,
		private readonly emailService: EmailService,
		private readonly databaseService: DatabaseService,
	) {
		this.logger.setContext(AdminService.name);
	}

	async getStats() {
		try {
			return await this.adminRepository.countUsersByRole();
		} catch (error) {
			this.logger.error(error);
			throw new InternalServerErrorException('Error loading dashboard.');
		}
	}

	async getActivities(adminId: string) {
		try {
			return await this.adminRepository.countUsersVerificationsByAdmin(adminId);
		} catch (error) {
			this.logger.error(error);
			throw new InternalServerErrorException('Error loading dashboard.');
		}
	}

	async getVerificationQueue(
		query: VerificationQueueQueryDto,
	): Promise<VerificationQueueResponse> {
		try {
			const { limit, cursor, role } = query;

			if (cursor) {
				const isValidCursor = await this.adminRepository.validateCursor(cursor);
				if (!isValidCursor) {
					throw new BadRequestException('Invalid cursor provided.');
				}
			}

			const users = await this.adminRepository.listPendingUsers(
				cursor || null,
				role || null,
				limit + 1,
			);

			const hasMore = users.length > limit;
			const data = hasMore ? users.slice(0, limit) : users;
			const nextCursor =
				hasMore && data.length > 0 ? data[data.length - 1].id : null;

			return {
				data,
				pagination: {
					limit,
					nextCursor,
					hasMore,
				},
			};
		} catch (error) {
			if (error instanceof BadRequestException) {
				throw error;
			}

			this.logger.error(error);
			throw new InternalServerErrorException(
				'Error fetching verification queue.',
			);
		}
	}

	async getVerificationDetails(userId: string) {
		try {
			const user = await this.adminRepository.getUserById(userId);

			if (!user) {
				throw new NotFoundException('User not found.');
			}

			if (user.account_status !== 'PENDING') {
				throw new BadRequestException('User is not in the pending list.');
			}

			if (user.role === 'ADMIN') {
				throw new BadRequestException('Cannot view admin user details.');
			}

			const roleSpecificData = await this.adminRepository.getRoleSpecificData(
				userId,
				user.role,
			);

			const documents = await this.adminRepository.getUserDocuments(userId);

			const groupedDocuments = this.groupDocumentsByCategory(documents);

			return {
				user: {
					id: user.id,
					email: user.email,
					phone_number: user.phone_number,
					role: user.role,
					account_status: user.account_status,
					email_verified: user.email_verified,
					created_at: user.created_at,
				},
				roleSpecificData,
				documents: groupedDocuments,
				metadata: {
					totalDocuments: documents.length,
					lastUpdated: user.updated_at,
				},
			};
		} catch (error) {
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException
			) {
				throw error;
			}

			this.logger.error(error);
			throw new InternalServerErrorException(
				'Error fetching verification details.',
			);
		}
	}

	private groupDocumentsByCategory(documents: any[]) {
		const identity: any[] = [];
		const workplace: any[] = [];
		const other: any[] = [];

		for (const doc of documents) {
			const docInfo = {
				id: doc.id,
				fileType: doc.file_type,
				fileName: doc.file_name,
				mimeType: doc.mime_type,
				fileSizeBytes: doc.file_size_bytes,
				uploadedAt: doc.uploaded_at,
				downloadUrl: `/api/admin/verification-queue/documents/${doc.id}`,
				previewUrl: doc.mime_type.startsWith('image/')
					? `/api/admin/verification-queue/documents/${doc.id}`
					: null,
			};

			if (
				[
					'NATIONAL_ID_FRONT',
					'NATIONAL_ID_BACK',
					'SELFIE_WITH_ID',
					'MEDICAL_LICENSE',
				].includes(doc.file_type)
			) {
				identity.push(docInfo);
			} else if (
				[
					'WORKPLACE_DOC',
					'LAB_ACCREDITATION',
					'RADIOLOGY_ACCREDITATION',
					'LOGO',
				].includes(doc.file_type)
			) {
				workplace.push(docInfo);
			} else {
				other.push(docInfo);
			}
		}

		return {
			identity,
			workplace,
			other,
		};
	}

	async getDocumentForDownload(documentId: string) {
		try {
			const document = await this.adminRepository.getDocumentById(documentId);

			if (!document) {
				throw new NotFoundException('Document not found.');
			}

			const user = await this.adminRepository.getUserById(document.user_id);
			if (!user || user.account_status !== 'PENDING') {
				throw new BadRequestException('Document not available for download.');
			}

			return document;
		} catch (error) {
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException
			) {
				throw error;
			}

			this.logger.error(error);
			throw new InternalServerErrorException('Error fetching document.');
		}
	}

	async processVerificationDecision(
		adminId: string,
		dto: VerificationDecisionDto,
	): Promise<{ message: string }> {
		const { userId, decision, rejectionReason } = dto;

		const validation =
			await this.adminRepository.validateUserForDecision(userId);

		if (!validation.exists) {
			throw new NotFoundException('User not found.');
		}

		if (validation.isAdmin) {
			throw new BadRequestException('Cannot process admin accounts.');
		}

		if (!validation.isPending) {
			throw new ConflictException(
				'User is not in pending status. Decision may have already been made.',
			);
		}

		const client = await this.databaseService.getClient();

		try {
			await client.query('BEGIN');

			if (decision === VerificationDecision.APPROVE) {
				await this.adminRepository.approveUser(client, userId, adminId);
				this.logger.info(`User ${userId} approved by admin ${adminId}`);
			} else {
				await this.adminRepository.rejectUser(
					client,
					userId,
					adminId,
					rejectionReason!,
				);
				this.logger.info(
					`User ${userId} rejected by admin ${adminId}. Reason: ${rejectionReason}.`,
				);
			}

			await client.query('COMMIT');
		} catch (error) {
			await client.query('ROLLBACK');
			this.logger.error(
				'Transaction failed during verification decision:',
				error,
			);
			throw new InternalServerErrorException(
				'Failed to process verification decision.',
			);
		} finally {
			client.release();
		}

		try {
			await this.sendDecisionEmail(userId, decision, rejectionReason);
		} catch (emailError) {
			this.logger.error(
				`Failed to send decision email to user ${userId}:`,
				emailError,
			);
		}

		const successMessage =
			decision === VerificationDecision.APPROVE
				? 'User has been successfully verified and notified via email.'
				: 'User has been rejected and notified via email.';

		return { message: successMessage };
	}

	private async sendDecisionEmail(
		userId: string,
		decision: VerificationDecision,
		rejectionReason?: string,
	): Promise<void> {
		const userDetails =
			await this.adminRepository.getUserDetailsForNotification(userId);

		if (!userDetails) {
			throw new Error('User details not found for email notification.');
		}

		let userName: string | undefined;
		if (userDetails.firstName && userDetails.surname) {
			userName = `${userDetails.firstName} ${userDetails.surname}`;
		} else if (userDetails.labName) {
			userName = userDetails.labName;
		} else if (userDetails.centerName) {
			userName = userDetails.centerName;
		}

		if (decision === VerificationDecision.APPROVE) {
			const htmlContent = constructApprovalEmailTemplate(
				userDetails.role,
				userName,
			);

			await this.emailService.send({
				to: {
					email: userDetails.email,
					name: userName,
				},
				subject: 'Your Sijill Application Has Been Approved!',
				html: htmlContent,
				category: 'verification_approval',
			});

			this.logger.info(`Approval email sent to ${userDetails.email}`);
		} else {
			const htmlContent = constructRejectionEmailTemplate(
				userDetails.role,
				rejectionReason!,
				userName,
			);

			await this.emailService.send({
				to: {
					email: userDetails.email,
					name: userName,
				},
				subject: 'Update on Your Sijill Application',
				html: htmlContent,
				category: 'verification_rejection',
			});

			this.logger.info(`Rejection email sent to ${userDetails.email}`);
		}
	}
}
