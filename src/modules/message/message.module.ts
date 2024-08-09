import { Module } from '@nestjs/common';
import { MessageGateway } from './message.gateway';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { PrismaService } from 'src/config/db/prisma.service';
import { UserService } from '../user/user.service';

@Module({
  imports: [],
  providers: [MessageGateway, PrismaService, MessageService, UserService],
  controllers: [MessageController],
})
export class MessageModule {}
