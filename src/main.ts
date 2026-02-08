import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

(async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.useGlobalPipes(
		new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
	);
	app.use(cookieParser());
	await app.listen(process.env.PORT ?? 8000);
	console.log(`Application is running on PORT ${process.env.PORT ?? 8000}`);
})();
