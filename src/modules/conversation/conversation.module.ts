import { Module } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { PrismaService } from 'src/config/db/prisma.service';
import { MessageService } from '../message/message.service';
import { UserService } from '../user/user.service';
import { CloudinaryService } from 'src/utils/cloudinary.service';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [MessageModule],
  controllers: [ConversationController],
  providers: [
    ConversationService,
    PrismaService,
    MessageService,
    UserService,
    CloudinaryService,
  ],
})
export class ConversationModule {}
