import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { MultipartMiddleware } from './middlewares/registration.middleware';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './repository/auth.repository';

@Module({
    imports:[],
    exports:[],
    controllers:[AuthController],
    providers:[AuthService, AuthRepository]
})
export class AuthModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(MultipartMiddleware)
            .forRoutes({ path: 'api/v1/auth/register', method: RequestMethod.POST });
    }
}