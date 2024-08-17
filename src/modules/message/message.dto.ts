import { IsNotEmpty } from 'class-validator';

export class CreateConversationDto {
  members: {
    id: string;
    name: string;
    email: string;
    image: string;
  }[];
}

export class CreateMessageDto {
  @IsNotEmpty()
  conversationId: string;
  @IsNotEmpty()
  message: string;
  replyMessageId: string;
  type: string;
}

export class UploadFileDto {
  @IsNotEmpty()
  conversationId: string;
}

export class CreateVoiceClipDto {
  @IsNotEmpty()
  conversationId: string;
  duration: string;
}
