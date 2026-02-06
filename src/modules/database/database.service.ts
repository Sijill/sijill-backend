import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
	private pool: Pool;

	async onModuleInit() {
		this.pool = new Pool({
			host: process.env.DB_HOST,
			port: parseInt(process.env.DB_PORT || '5432'),
			database: process.env.DB_NAME,
			user: process.env.DB_USER,
			password: process.env.DB_PASSWORD,
			max: 20,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 2000,
		});

		try {
			const client = await this.pool.connect();
			console.log('Database connected successfully');
			client.release();
		} catch (error) {
			console.error('Database connection failed:', error);
			throw error;
		}
	}

	async onModuleDestroy() {
		await this.pool.end();
		console.log('Database connection pool closed');
	}

	async getClient(): Promise<PoolClient> {
		return this.pool.connect();
	}

	async query(text: string, params?: any[]) {
		return this.pool.query(text, params);
	}
}
