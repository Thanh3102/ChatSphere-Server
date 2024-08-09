import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './modules/user/user.module';
import { MessageModule } from './modules/message/message.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env'],
      isGlobal: true,
    }),
    JwtModule.register({
      global: true,
    }),
    AuthModule,
    UserModule,
    MessageModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
