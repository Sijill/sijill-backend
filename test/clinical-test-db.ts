import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

type TestDatabaseConfig = {
	host: string;
	port: number;
	user: string;
	password: string;
	adminDatabase: string;
};

export async function createClinicalTestDatabase(
	config: TestDatabaseConfig,
): Promise<string> {
	const databaseName = `sijill_clinical_test_${Date.now()}`;
	const adminClient = new Client({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		database: config.adminDatabase,
	});

	await adminClient.connect();

	try {
		await adminClient.query(`CREATE DATABASE ${databaseName}`);
	} finally {
		await adminClient.end();
	}

	const schemaSql = fs.readFileSync(
		path.join(process.cwd(), 'src/modules/database/schema.sql'),
		'utf-8',
	);

	const testDbClient = new Client({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		database: databaseName,
	});

	await testDbClient.connect();

	try {
		await testDbClient.query(schemaSql);
	} finally {
		await testDbClient.end();
	}

	return databaseName;
}

export async function dropClinicalTestDatabase(
	config: TestDatabaseConfig,
	databaseName: string,
) {
	const adminClient = new Client({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		database: config.adminDatabase,
	});

	await adminClient.connect();

	try {
		await adminClient.query(
			`
				SELECT pg_terminate_backend(pid)
				FROM pg_stat_activity
				WHERE datname = $1
					AND pid <> pg_backend_pid()
			`,
			[databaseName],
		);
		await adminClient.query(`DROP DATABASE IF EXISTS ${databaseName}`);
	} finally {
		await adminClient.end();
	}
}
