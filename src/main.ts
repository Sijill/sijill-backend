import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { validateConfig } from '@common/validators/config.validator';
import cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as path from 'path';

(async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	const uploadDirs = [
		'uploads/identity',
		'uploads/clinical',
		'uploads/workplace',
	];

	uploadDirs.forEach((dir) => {
		const fullPath = path.join(process.cwd(), dir);
		if (!fs.existsSync(fullPath)) {
			fs.mkdirSync(fullPath, { recursive: true });
		}
	});

	validateConfig();

	app.useLogger(app.get(Logger));

	app.enableCors({
		origin: (origin, callback) => {
			callback(null, true);
		},
		credentials: true,
	});

	app.useGlobalPipes(
		new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
	);

	app.use(cookieParser());

	await app.listen(process.env.PORT ?? 8000);
	console.log(`Server started on PORT: ${process.env.PORT ?? 8000}`);
})();
