import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DatabaseService } from '@db/database.service';

export interface ChatSessionRow {
	id: string;
	patientId: string;
	status: string;
	title: string | null;
	messageCount: number;
	lastMessagePreview: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface ChatMessageRow {
	id: string;
	sessionId: string;
	role: string;
	content: string;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
}

export interface CreateMessageResult {
	id: string;
	sessionId: string;
	role: string;
	content: string;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
}

@Injectable()
export class PatientAIRepository {
	constructor(
		private readonly databaseService: DatabaseService,
		private readonly logger: PinoLogger,
	) {
		this.logger.setContext(PatientAIRepository.name);
	}

	async getPatientIdByUserId(userId: string): Promise<string | null> {
		const { rows } = await this.databaseService.query(
			`SELECT id FROM patients WHERE user_id = $1`,
			[userId],
		);

		return rows[0]?.id ?? null;
	}

	async createSession(
		patientId: string,
		title?: string,
	): Promise<ChatSessionRow> {
		const { rows } = await this.databaseService.query(
			`INSERT INTO ai_chat_sessions (patient_id, title)
			 VALUES ($1, $2)
			 RETURNING
			   id,
			   patient_id AS "patientId",
			   status,
			   title,
			   message_count AS "messageCount",
			   created_at AS "createdAt",
			   updated_at AS "updatedAt"`,
			[patientId, title ?? null],
		);

		return {
			...rows[0],
			lastMessagePreview: null,
		};
	}

	async listSessions(
		patientId: string,
		status?: string,
	): Promise<ChatSessionRow[]> {
		const statusFilter =
			status === 'ACTIVE' || status === 'ARCHIVED' ? status : null;

		const { rows } = await this.databaseService.query(
			`SELECT
			   s.id,
			   s.patient_id AS "patientId",
			   s.status,
			   s.title,
			   s.message_count AS "messageCount",
			   LEFT(m.content, 120) AS "lastMessagePreview",
			   s.created_at AS "createdAt",
			   s.updated_at AS "updatedAt"
			 FROM ai_chat_sessions s
			 LEFT JOIN LATERAL (
			   SELECT content
			   FROM ai_chat_messages
			   WHERE session_id = s.id AND role = 'assistant'
			   ORDER BY created_at DESC
			   LIMIT 1
			 ) m ON TRUE
			 WHERE s.patient_id = $1
			   AND ($2::VARCHAR IS NULL OR s.status = $2)
			 ORDER BY s.updated_at DESC, s.created_at DESC`,
			[patientId, statusFilter],
		);

		return rows;
	}

	async getSession(
		patientId: string,
		sessionId: string,
	): Promise<ChatSessionRow | null> {
		const { rows } = await this.databaseService.query(
			`SELECT
			   id,
			   patient_id AS "patientId",
			   status,
			   title,
			   message_count AS "messageCount",
			   created_at AS "createdAt",
			   updated_at AS "updatedAt"
			 FROM ai_chat_sessions
			 WHERE id = $1 AND patient_id = $2`,
			[sessionId, patientId],
		);

		if (rows.length === 0) return null;

		return {
			...rows[0],
			lastMessagePreview: null,
		};
	}

	async getSessionWithMessages(
		patientId: string,
		sessionId: string,
	): Promise<{ session: ChatSessionRow; messages: ChatMessageRow[] } | null> {
		const session = await this.getSession(patientId, sessionId);
		if (!session) return null;

		const { rows } = await this.databaseService.query(
			`SELECT
			   id,
			   session_id AS "sessionId",
			   role,
			   content,
			   metadata,
			   created_at AS "createdAt"
			 FROM ai_chat_messages
			 WHERE session_id = $1
			 ORDER BY created_at ASC`,
			[sessionId],
		);

		return { session, messages: rows };
	}

	async updateSession(
		patientId: string,
		sessionId: string,
		data: { status?: string; title?: string },
	): Promise<ChatSessionRow | null> {
		const sets: string[] = [];
		const params: unknown[] = [];
		let paramIndex = 1;

		if (data.status !== undefined) {
			sets.push(`status = $${paramIndex++}`);
			params.push(data.status);
		}
		if (data.title !== undefined) {
			sets.push(`title = $${paramIndex++}`);
			params.push(data.title);
		}

		if (sets.length === 0) return null;

		sets.push(`updated_at = now()`);

		params.push(sessionId, patientId);

		const { rows } = await this.databaseService.query(
			`UPDATE ai_chat_sessions
			 SET ${sets.join(', ')}
			 WHERE id = $${paramIndex++} AND patient_id = $${paramIndex++}
			 RETURNING
			   id,
			   patient_id AS "patientId",
			   status,
			   title,
			   message_count AS "messageCount",
			   created_at AS "createdAt",
			   updated_at AS "updatedAt"`,
			params,
		);

		if (rows.length === 0) return null;

		return {
			...rows[0],
			lastMessagePreview: null,
		};
	}

	async createMessage(
		sessionId: string,
		role: string,
		content: string,
		metadata?: Record<string, unknown>,
	): Promise<CreateMessageResult> {
		const { rows } = await this.databaseService.query(
			`INSERT INTO ai_chat_messages (session_id, role, content, metadata)
			 VALUES ($1, $2, $3, $4)
			 RETURNING
			   id,
			   session_id AS "sessionId",
			   role,
			   content,
			   metadata,
			   created_at AS "createdAt"`,
			[sessionId, role, content, metadata ?? null],
		);

		return rows[0];
	}

	async incrementMessageCount(
		sessionId: string,
		title?: string,
	): Promise<void> {
		if (title) {
			await this.databaseService.query(
				`UPDATE ai_chat_sessions
				 SET message_count = message_count + 1, title = $2, updated_at = now()
				 WHERE id = $1`,
				[sessionId, title],
			);
		} else {
			await this.databaseService.query(
				`UPDATE ai_chat_sessions
				 SET message_count = message_count + 1, updated_at = now()
				 WHERE id = $1`,
				[sessionId],
			);
		}
	}

	async getRecentMessages(
		sessionId: string,
		limit = 15,
	): Promise<ChatMessageRow[]> {
		const { rows } = await this.databaseService.query(
			`SELECT
			   id,
			   session_id AS "sessionId",
			   role,
			   content,
			   metadata,
			   created_at AS "createdAt"
			 FROM ai_chat_messages
			 WHERE session_id = $1
			 ORDER BY created_at DESC
			 LIMIT $2`,
			[sessionId, limit],
		);

		return rows.reverse();
	}

	async getSessionMessageCount(sessionId: string): Promise<number> {
		const { rows } = await this.databaseService.query(
			`SELECT message_count AS "count" FROM ai_chat_sessions WHERE id = $1`,
			[sessionId],
		);

		return rows[0]?.count ?? 0;
	}

	async deleteAllSessions(patientId: string): Promise<number> {
		await this.databaseService.query(
			`DELETE FROM ai_chat_messages
			 WHERE session_id IN (
			   SELECT id FROM ai_chat_sessions WHERE patient_id = $1
			 )`,
			[patientId],
		);

		const result = await this.databaseService.query(
			`DELETE FROM ai_chat_sessions WHERE patient_id = $1`,
			[patientId],
		);

		return result.rowCount ?? 0;
	}
}
