import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '@db/database.service';
import {
	UsersCountByRole,
	VerificationsCountByAdmin,
	VerificationDecisionResult,
	UsersMeta,
	UserListItem,
	SuspendedUserListItem,
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

	async countUsers(): Promise<UsersMeta> {
		try {
			const query = `
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE account_status = 'SUSPENDED') AS suspended
                FROM users
                WHERE role != 'ADMIN'
            `;

			const { rows } = await this.databaseService.query(query);

			return {
				totalUsers: Number(rows[0].total),
				suspendedUsers: Number(rows[0].suspended),
			};
		} catch (error) {
			this.logger.error(error);
			throw new DatabaseOperationException('Unable to fetch user counts.');
		}
	}

	async listUsers(
		limit: number,
		offset: number,
		role: string | null,
		status: string | null,
	): Promise<{ rows: UserListItem[]; total: number }> {
		try {
			const conditions: string[] = ["u.role != 'ADMIN'"];
			const baseParams: any[] = [];

			if (role) {
				conditions.push(`u.role = $${baseParams.length + 1}`);
				baseParams.push(role);
			}

			if (status) {
				conditions.push(`u.account_status = $${baseParams.length + 1}`);
				baseParams.push(status);
			}

			const whereClause = conditions.join(' AND ');

			const countQuery = `SELECT COUNT(*) FROM users u WHERE ${whereClause}`;
			const { rows: countRows } = await this.databaseService.query(
				countQuery,
				baseParams,
			);

			const dataParams = [...baseParams, limit, offset];
			const dataQuery = `
                SELECT 
                    u.id,
                    u.email,
                    u.role,
                    u.account_status AS status,
                    u.created_at AS joined_at,
                    u.updated_at AS last_active,
                    CASE 
                        WHEN u.role = 'PATIENT' THEN CONCAT(p.first_name, ' ', p.surname)
                        WHEN u.role = 'HEALTHCARE_PROVIDER' THEN CONCAT(hp.first_name, ' ', hp.surname)
                        WHEN u.role = 'LAB' THEN l.lab_name
                        WHEN u.role = 'IMAGING_CENTER' THEN ic.center_name
                    END AS name
                FROM users u
                LEFT JOIN patients p ON p.user_id = u.id
                LEFT JOIN healthcare_providers hp ON hp.user_id = u.id
                LEFT JOIN laboratories l ON l.user_id = u.id
                LEFT JOIN imaging_centers ic ON ic.user_id = u.id
                WHERE ${whereClause}
                ORDER BY u.created_at DESC
                LIMIT $${baseParams.length + 1}
                OFFSET $${baseParams.length + 2}
            `;

			const { rows } = await this.databaseService.query(dataQuery, dataParams);

			return {
				rows,
				total: Number(countRows[0].count),
			};
		} catch (error) {
			this.logger.error(error);
			throw new DatabaseOperationException('Unable to fetch users list.');
		}
	}

	async validateUserForStatusChange(userId: string): Promise<{
		exists: boolean;
		isAdmin: boolean;
		isSuspended: boolean;
	}> {
		try {
			const query = `
                SELECT 
                    id,
                    role,
                    account_status
                FROM users
                WHERE id = $1
            `;

			const { rows } = await this.databaseService.query(query, [userId]);

			if (rows.length === 0) {
				return { exists: false, isAdmin: false, isSuspended: false };
			}

			const user = rows[0];
			return {
				exists: true,
				isAdmin: user.role === 'ADMIN',
				isSuspended: user.account_status === 'SUSPENDED',
			};
		} catch (error) {
			this.logger.error('Error validating user for status change:', error);
			throw new DatabaseOperationException('Failed to validate user');
		}
	}

	async suspendUser(userId: string, reason: string): Promise<void> {
		try {
			const query = `
                UPDATE users
                SET 
                    account_status = 'SUSPENDED',
                    suspended_at = now(),
                    suspention_reason = $2,
                    updated_at = now()
                WHERE id = $1
            `;

			const result = await this.databaseService.query(query, [userId, reason]);

			if (result.rowCount === 0) {
				throw new DatabaseOperationException('User not found.');
			}
		} catch (error) {
			this.logger.error('Error suspending user:', error);
			throw new DatabaseOperationException('Failed to suspend user.');
		}
	}

	async reactivateUser(userId: string): Promise<void> {
		try {
			const query = `
                UPDATE users
                SET account_status = 'VERIFIED', updated_at = now()
                WHERE id = $1
            `;

			const result = await this.databaseService.query(query, [userId]);

			if (result.rowCount === 0) {
				throw new DatabaseOperationException('User not found.');
			}
		} catch (error) {
			this.logger.error('Error reactivating user:', error);
			throw new DatabaseOperationException('Failed to reactivate user.');
		}
	}

	async listSuspendedUsers(
		limit: number,
		offset: number,
	): Promise<{ rows: SuspendedUserListItem[]; total: number }> {
		try {
			const conditions: string[] = [
				"u.role != 'ADMIN'",
				"u.account_status = 'SUSPENDED'",
			];
			const whereClause = conditions.join(' AND ');

			const countQuery = `SELECT COUNT(*) FROM users u WHERE ${whereClause}`;
			const { rows: countRows } = await this.databaseService.query(countQuery);

			const dataQuery = `
                SELECT 
                    u.id,
                    u.email,
                    u.role,
                    u.account_status AS status,
                    u.created_at AS joined_at,
                    u.suspended_at,
                    u.suspention_reason,
                    CASE 
                        WHEN u.role = 'PATIENT' THEN CONCAT(p.first_name, ' ', p.surname)
                        WHEN u.role = 'HEALTHCARE_PROVIDER' THEN CONCAT(hp.first_name, ' ', hp.surname)
                        WHEN u.role = 'LAB' THEN l.lab_name
                        WHEN u.role = 'IMAGING_CENTER' THEN ic.center_name
                    END AS name
                FROM users u
                LEFT JOIN patients p ON p.user_id = u.id
                LEFT JOIN healthcare_providers hp ON hp.user_id = u.id
                LEFT JOIN laboratories l ON l.user_id = u.id
                LEFT JOIN imaging_centers ic ON ic.user_id = u.id
                WHERE ${whereClause}
                ORDER BY u.suspended_at DESC
                LIMIT $1
                OFFSET $2
            `;

			const { rows } = await this.databaseService.query(dataQuery, [
				limit,
				offset,
			]);

			return {
				rows,
				total: Number(countRows[0].count),
			};
		} catch (error) {
			this.logger.error(error);
			throw new DatabaseOperationException(
				'Unable to fetch suspended users list.',
			);
		}
	}

	async validateUserForReactivation(userId: string): Promise<{
		exists: boolean;
		isAdmin: boolean;
		isSuspended: boolean;
	}> {
		try {
			const query = `
                SELECT 
                    id,
                    role,
                    account_status
                FROM users
                WHERE id = $1
            `;

			const { rows } = await this.databaseService.query(query, [userId]);

			if (rows.length === 0) {
				return { exists: false, isAdmin: false, isSuspended: false };
			}

			const user = rows[0];
			return {
				exists: true,
				isAdmin: user.role === 'ADMIN',
				isSuspended: user.account_status === 'SUSPENDED',
			};
		} catch (error) {
			this.logger.error('Error validating user for reactivation:', error);
			throw new DatabaseOperationException('Failed to validate user');
		}
	}
}
