import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './modules/user/user.module';
import { MessageModule } from './modules/message/message.module';
import { ConversationModule } from './modules/conversation/conversation.module';

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
    ConversationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
