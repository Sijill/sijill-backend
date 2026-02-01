import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@db/database.module';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
    imports: [ConfigModule.forRoot({
        isGlobal: true
    }), DatabaseModule, AuthModule],
    exports: [],
    controllers: [],
    providers: []
})
export class AppModule {}