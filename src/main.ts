import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { validateConfig } from '@common/validators/config.validator';
import cookieParser from 'cookie-parser';

(async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	validateConfig();

	app.useGlobalPipes(
		new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
	);
	
	app.use(cookieParser());

	await app.listen(process.env.PORT ?? 8000);
	console.log(`Application is running on PORT ${process.env.PORT ?? 8000}`);
})();
