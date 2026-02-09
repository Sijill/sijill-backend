import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@db/database.module';
import { AuthModule } from '@modules/auth/auth.module';
import { EmailModule } from '@email/email.module';

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
		DatabaseModule,
		EmailModule,
		AuthModule,
	],
	exports: [],
	controllers: [],
	providers: [],
})
export class AppModule {}
