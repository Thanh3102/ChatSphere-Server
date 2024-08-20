import { Module } from '@nestjs/common';
import { MessageGateway } from './message.gateway';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { PrismaService } from 'src/config/db/prisma.service';
import { UserService } from '../user/user.service';
import { ConversationService } from '../conversation/conversation.service';
import { CloudinaryService } from 'src/utils/cloudinary.service';

@Module({
  imports: [],
  providers: [
    MessageGateway,
    PrismaService,
    MessageService,
    UserService,
    ConversationService,
    CloudinaryService,
  ],
  controllers: [MessageController],
  exports: [MessageGateway],
})
export class MessageModule {}
