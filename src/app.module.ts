import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@db/database.module';
import { AuthModule } from '@modules/auth/auth.module';
import { EmailModule } from '@email/email.module';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath:
				process.env.NODE_ENV === 'production'
					? '.env.production'
					: '.env.development',
			ignoreEnvFile: process.env.DOCKER_ENV === 'false',
		}),

		ThrottlerModule.forRoot([{
			name: 'default',
			ttl: 60000,
			limit: 30,
		}]),

		LoggerModule.forRoot({
			pinoHttp: {
				autoLogging: false,
				level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

				transport:
					process.env.NODE_ENV !== 'production'
						? {
								target: 'pino-pretty',
								options: {
									colorize: true,
									singleLine: false,
									translateTime: 'yyyy-mm-dd HH:MM:ss',
								},
							}
						: undefined,
			},
		}),

		DatabaseModule,
		EmailModule,
		AuthModule,
	],
	exports: [],
	controllers: [],
	providers: [
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
	],
})
export class AppModule {}
