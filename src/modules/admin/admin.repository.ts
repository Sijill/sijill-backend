import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '@db/database.service';
import {
	UsersCountByRole,
	VerificationsCountByAdmin,
	VerificationDecisionResult,
} from './interfaces/repository-response.interface';
import { DatabaseOperationException } from './exceptions/exceptions';
import { PinoLogger } from 'nestjs-pino';
import { PoolClient } from 'pg';
import { VerificationQueueRole } from './dto/verification-queue-query.dto';
import { PendingUser } from './interfaces/verification-queue.interface';

@Injectable()
export class AdminRepository {
	constructor(
		private readonly databaseService: DatabaseService,
		private readonly logger: PinoLogger,
	) {
		this.logger.setContext(AdminRepository.name);
	}

	async countUsersByRole(): Promise<UsersCountByRole> {
		try {
			const query = `
                SELECT
                COUNT(*) FILTER (WHERE role = 'PATIENT')             AS patients,
                COUNT(*) FILTER (WHERE role = 'HEALTHCARE_PROVIDER') AS healthcare_providers,
                COUNT(*) FILTER (WHERE role = 'LAB')                 AS laboratories,
                COUNT(*) FILTER (WHERE role = 'IMAGING_CENTER')      AS imaging_centers
                FROM users;
            `;

			const { rows } = await this.databaseService.query(query);

			return {
				patients: Number(rows[0].patients),
				healthcareProviders: Number(rows[0].healthcare_providers),
				laboratories: Number(rows[0].laboratories),
				imagingCenters: Number(rows[0].imaging_centers),
			};
		} catch (error) {
			this.logger.error(error);
			throw new DatabaseOperationException('Unable to fetch users stats.');
		}
	}

	async countUsersVerificationsByAdmin(
		adminId: string,
	): Promise<VerificationsCountByAdmin> {
		try {
			const query = `
                SELECT
                COUNT(*) FILTER (
                    WHERE account_status = 'VERIFIED'
                    AND verified_by = $1
                ) AS verified_users,
                COUNT(*) FILTER (
                    WHERE account_status = 'REJECTED'
                    AND rejected_by = $1
                ) AS rejected_users
                FROM users;
            `;

			const { rows } = await this.databaseService.query(query, [adminId]);

			if (!rows[0]) throw new NotFoundException('Admin not found');

			return {
				verifiedUsers: Number(rows[0].verified_users),
				rejectedUsers: Number(rows[0].rejected_users),
			};
		} catch (error) {
			this.logger.error(error);
			throw new DatabaseOperationException('Unable to fetch admin activities.');
		}
	}

	async validateCursor(cursor: string): Promise<boolean> {
		try {
			const query = `
                SELECT 1 
                FROM users 
                WHERE id = $1 AND account_status = 'PENDING'
            `;
			const { rowCount } = await this.databaseService.query(query, [cursor]);
			return (rowCount ?? 0) > 0;
		} catch (error) {
			this.logger.error(error);
			return false;
		}
	}

	async listPendingUsers(
		startId: string | null,
		role: VerificationQueueRole | null,
		limit: number,
	): Promise<PendingUser[]> {
		try {
			let query: string;
			const params: any[] = [limit];

			if (role) {
				if (startId) {
					query = `
                        SELECT 
                            id,
                            email,
                            role,
                            created_at
                        FROM users
                        WHERE account_status = 'PENDING'
                            AND role = $2
                            AND id < $3
                        ORDER BY id DESC
                        LIMIT $1
                    `;
					params.push(role, startId);
				} else {
					query = `
                        SELECT 
                            id,
                            email,
                            role,
                            created_at
                        FROM users
                        WHERE account_status = 'PENDING'
                            AND role = $2
                        ORDER BY id DESC
                        LIMIT $1
                    `;
					params.push(role);
				}
			} else {
				if (startId) {
					query = `
                        SELECT 
                            id,
                            email,
                            role,
                            created_at
                        FROM users
                        WHERE account_status = 'PENDING'
                            AND role != 'ADMIN'
                            AND id < $2
                        ORDER BY id DESC
                        LIMIT $1
                    `;
					params.push(startId);
				} else {
					query = `
                        SELECT 
                            id,
                            email,
                            role,
                            created_at
                        FROM users
                        WHERE account_status = 'PENDING'
                            AND role != 'ADMIN'
                        ORDER BY id DESC
                        LIMIT $1
                    `;
				}
			}

			const { rows } = await this.databaseService.query(query, params);
			return rows;
		} catch (error) {
			this.logger.error(error);
			throw new DatabaseOperationException('Unable to fetch pending users.');
		}
	}

	async getUserById(userId: string) {
		try {
			const query = `SELECT * FROM users WHERE id = $1`;
			const { rows } = await this.databaseService.query(query, [userId]);
			return rows[0] || null;
		} catch (error) {
			this.logger.error(error);
			throw new DatabaseOperationException('Unable to fetch user.');
		}
	}

	async getRoleSpecificData(userId: string, role: string) {
		try {
			let query: string;
			let tableName: string;

			switch (role) {
				case 'PATIENT':
					tableName = 'patients';
					query = `
                        SELECT 
                            first_name,
                            middle_name,
                            surname,
                            gender,
                            date_of_birth,
                            national_id,
                            blood_type
                        FROM patients
                        WHERE user_id = $1
                    `;
					break;

				case 'HEALTHCARE_PROVIDER':
					tableName = 'healthcare_providers';
					query = `
                        SELECT 
                            first_name,
                            middle_name,
                            surname,
                            gender,
                            date_of_birth,
                            national_id,
                            medical_license_number,
                            specialization,
                            workplace_name,
                            workplace_address
                        FROM healthcare_providers
                        WHERE user_id = $1
                    `;
					break;

				case 'LAB':
					tableName = 'laboratories';
					query = `
                        SELECT 
                            lab_name,
                            registration_number,
                            administrator_full_name,
                            lab_address
                        FROM laboratories
                        WHERE user_id = $1
                    `;
					break;

				case 'IMAGING_CENTER':
					tableName = 'imaging_centers';
					query = `
                        SELECT 
                            center_name,
                            registration_number,
                            administrator_full_name,
                            center_address
                        FROM imaging_centers
                        WHERE user_id = $1
                    `;
					break;

				default:
					return null;
			}

			const { rows } = await this.databaseService.query(query, [userId]);
			return rows[0] || null;
		} catch (error) {
			this.logger.error(error);
			throw new DatabaseOperationException(`Unable to fetch ${role} data.`);
		}
	}

	async getUserDocuments(userId: string) {
		try {
			const query = `
                SELECT 
                    id,
                    file_type,
                    file_path,
                    file_name,
                    mime_type,
                    file_size_bytes,
                    uploaded_at
                FROM documents
                WHERE user_id = $1
                ORDER BY uploaded_at DESC
            `;

			const { rows } = await this.databaseService.query(query, [userId]);
			return rows;
		} catch (error) {
			this.logger.error(error);
			throw new DatabaseOperationException('Unable to fetch user documents.');
		}
	}

	async getDocumentById(documentId: string) {
		try {
			const query = `
                SELECT 
                    id,
                    user_id,
                    file_type,
                    file_path,
                    file_name,
                    mime_type,
                    file_size_bytes
                FROM documents
                WHERE id = $1
            `;

			const { rows } = await this.databaseService.query(query, [documentId]);
			return rows[0] || null;
		} catch (error) {
			this.logger.error(error);
			throw new DatabaseOperationException('Unable to fetch document.');
		}
	}

	// Must be called within a transaction
	async approveUser(
		client: PoolClient,
		userId: string,
		adminId: string,
	): Promise<void> {
		try {
			const query = `
                UPDATE users
                SET 
                    account_status = 'VERIFIED',
                    verified_at = now(),
                    verified_by = $2,
                    updated_at = now()
                WHERE id = $1
                    AND account_status = 'PENDING'
            `;

			const result = await client.query(query, [userId, adminId]);

			if (result.rowCount === 0) {
				throw new DatabaseOperationException(
					'User not found or not in pending status.',
				);
			}
		} catch (error) {
			this.logger.error('Error approving user:', error);
			throw new DatabaseOperationException('Failed to approve user.');
		}
	}

	// Must be called within a transaction
	async rejectUser(
		client: PoolClient,
		userId: string,
		adminId: string,
		rejectionReason: string,
	): Promise<void> {
		try {
			const query = `
                UPDATE users
                SET 
                    account_status = 'REJECTED',
                    rejected_at = now(),
                    rejected_by = $2,
                    rejection_reason = $3,
                    updated_at = now()
                WHERE id = $1
                    AND account_status = 'PENDING'
            `;

			const result = await client.query(query, [
				userId,
				adminId,
				rejectionReason,
			]);

			if (result.rowCount === 0) {
				throw new DatabaseOperationException(
					'User not found or not in pending status.',
				);
			}
		} catch (error) {
			this.logger.error('Error rejecting user:', error);
			throw new DatabaseOperationException('Failed to reject user.');
		}
	}

	async getUserDetailsForNotification(
		userId: string,
	): Promise<VerificationDecisionResult | null> {
		try {
			const userQuery = `
                SELECT 
                    id,
                    email,
                    role,
                    account_status
                FROM users
                WHERE id = $1
            `;

			const { rows: userRows } = await this.databaseService.query(userQuery, [
				userId,
			]);

			if (userRows.length === 0) {
				return null;
			}

			const user = userRows[0];
			const result: VerificationDecisionResult = {
				userId: user.id,
				email: user.email,
				role: user.role,
				accountStatus: user.account_status,
			};

			switch (user.role) {
				case 'PATIENT':
				case 'HEALTHCARE_PROVIDER': {
					const tableName =
						user.role === 'PATIENT' ? 'patients' : 'healthcare_providers';
					const nameQuery = `
                        SELECT first_name, middle_name, surname
                        FROM ${tableName}
                        WHERE user_id = $1
                    `;
					const { rows: nameRows } = await this.databaseService.query(
						nameQuery,
						[userId],
					);

					if (nameRows.length > 0) {
						result.firstName = nameRows[0].first_name;
						result.middleName = nameRows[0].middle_name;
						result.surname = nameRows[0].surname;
					}
					break;
				}

				case 'LAB': {
					const labQuery = `
                        SELECT lab_name
                        FROM laboratories
                        WHERE user_id = $1
                    `;
					const { rows: labRows } = await this.databaseService.query(labQuery, [
						userId,
					]);

					if (labRows.length > 0) {
						result.labName = labRows[0].lab_name;
					}
					break;
				}

				case 'IMAGING_CENTER': {
					const centerQuery = `
                        SELECT center_name
                        FROM imaging_centers
                        WHERE user_id = $1
                    `;
					const { rows: centerRows } = await this.databaseService.query(
						centerQuery,
						[userId],
					);

					if (centerRows.length > 0) {
						result.centerName = centerRows[0].center_name;
					}
					break;
				}
			}

			return result;
		} catch (error) {
			this.logger.error('Error fetching user details for notification:', error);
			throw new DatabaseOperationException(
				'Failed to fetch user details for notification.',
			);
		}
	}

	async validateUserForDecision(userId: string): Promise<{
		exists: boolean;
		isPending: boolean;
		isAdmin: boolean;
	}> {
		try {
			const query = `
                SELECT 
                    id,
                    account_status,
                    role
                FROM users
                WHERE id = $1
            `;

			const { rows } = await this.databaseService.query(query, [userId]);

			if (rows.length === 0) {
				return { exists: false, isPending: false, isAdmin: false };
			}

			const user = rows[0];
			return {
				exists: true,
				isPending: user.account_status === 'PENDING',
				isAdmin: user.role === 'ADMIN',
			};
		} catch (error) {
			this.logger.error('Error validating user for decision:', error);
			throw new DatabaseOperationException('Failed to validate user');
		}
	}
}
