import {
	Module,
	NestModule,
	MiddlewareConsumer,
	RequestMethod,
} from '@nestjs/common';
import { MultipartMiddleware } from './middlewares/registration.middleware';
import { AuthController } from './auth.controller';
import { RegisterService } from './services/register.service';
import { RegisterRepository } from './repository/register.repository';
import { LoginService } from './services/login.service';
import { LoginRepository } from './repository/login.repository';
import { PasswordResetService } from './services/reset-password.service';
import { PasswordResetRepository } from './repository/reset-password.repository';

@Module({
	imports: [],
	exports: [],
	controllers: [AuthController],
	providers: [
		RegisterService,
		RegisterRepository,
		LoginService,
		LoginRepository,
		PasswordResetService,
		PasswordResetRepository,
	],
})
export class AuthModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(MultipartMiddleware)
			.forRoutes({ path: 'api/v1/auth/register', method: RequestMethod.POST });
	}
}
