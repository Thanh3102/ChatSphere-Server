import { IsNotEmpty } from 'class-validator';

export class CreateConversationDto {
  members: {
    id: string;
    name: string;
    email: string;
    image: string;
  }[];
  message: string;
}

export class CreateMessageDto {
  @IsNotEmpty()
  conversationId: string;
  message: string;
  replyMessageId: string;
}

export class UploadFileDto {
  @IsNotEmpty()
  conversationId: string;
}
