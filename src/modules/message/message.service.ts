import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from 'src/config/db/prisma.service';
import { defaultErrorMessage } from 'src/shared/constants/constants';
import { CreateMessageDto } from 'src/shared/types';
import { MessageGateway } from './message.gateway';
import {
  MessageBasicSelect,
  UserBasicSelect,
} from 'src/shared/constants/prismaSelector';

import { v2 as cloudinary, UploadApiOptions } from 'cloudinary';
import { SOCKET_EVENT } from 'src/shared/enums';
import { ConversationService } from '../conversation/conversation.service';

@Injectable()
export class MessageService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => MessageGateway))
    private messageGateway: MessageGateway,
    private conversationService: ConversationService,
  ) {}

  async createNewMessage(dto: CreateMessageDto, req, res: Response) {
    try {
      if (!dto.message)
        return res.status(400).json({ message: 'No message body' });

      const newMessage = await this.createMessage({
        body: dto.message,
        type: dto.type,
        conversationId: dto.conversationId,
        responseId: dto.replyMessageId,
        senderId: req.user.id,
      });

      const users = await this.conversationService.findConversationUser(
        dto.conversationId,
      );

      for (const user of users) {
        if (user.isOnline) {
          this.messageGateway.server
            .to(user.socketId)
            .emit(SOCKET_EVENT.NEW_MESSAGE, newMessage);
          this.messageGateway.server
            .to(user.socketId)
            .emit(SOCKET_EVENT.RELOAD_CONVERSATION_LIST);
        }
      }

      return res.status(200).json({ message: 'Đã gửi tin nhắn' });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async uploadFileAttach(
    {
      file,
      conversationId,
    }: { file: Express.Multer.File; conversationId: string },
    req,
    res: Response,
  ) {
    try {
      if (!file) return res.status(400).json({ message: 'File not found' });

      const response = await this.uploadFile(file, {
        resource_type: 'auto',
        public_id: file.originalname,
        folder: `/conversation/${conversationId}`,
      });

      const currentUserId = req.user.id;
      const message = await this.prisma.message.create({
        data: {
          conversationId: conversationId,
          senderId: currentUserId,
          seenIds: [],
          fileAssetId: response.asset_id,
          fileURL: response.url,
          fileSecureURL: response.secure_url,
          fileName: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
          type: 'file',
        },
        include: {
          sender: true,
        },
      });

      await this.prisma.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          lastMessageAt: message.createdAt,
          lastMessageId: message.id,
        },
      });

      const users =
        await this.conversationService.findConversationUser(conversationId);

      for (const user of users) {
        if (user.isOnline) {
          this.messageGateway.server
            .to(user.socketId)
            .emit(SOCKET_EVENT.NEW_MESSAGE, message);
          this.messageGateway.server
            .to(user.socketId)
            .emit(SOCKET_EVENT.RELOAD_CONVERSATION_LIST);
        }
      }

      return res.status(200).json({ message: 'Upload file thành công' });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async uploadVoiceClip(
    {
      file,
      conversationId,
      duration,
    }: { file: Express.Multer.File; conversationId: string; duration: number },
    req,
    res: Response,
  ) {
    try {
      if (!file) return res.status(400).json({ message: 'No audio file' });
      const response = await this.uploadFile(file, {
        resource_type: 'auto',
        public_id: conversationId,
        folder: `/conversation/${conversationId}/voice/${conversationId}`,
      });
      const currentUserId = req.user.id;
      const message = await this.prisma.message.create({
        data: {
          conversationId: conversationId,
          senderId: currentUserId,
          seenIds: [],
          fileAssetId: response.asset_id,
          fileURL: response.url,
          fileSecureURL: response.secure_url,
          fileName: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
          voiceDuration: duration,
          type: 'voice',
        },
        include: {
          sender: true,
        },
      });

      await this.prisma.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          lastMessageAt: message.createdAt,
          lastMessageId: message.id,
        },
      });

      const users =
        await this.conversationService.findConversationUser(conversationId);

      for (const user of users) {
        if (user.isOnline) {
          this.messageGateway.server
            .to(user.socketId)
            .emit(SOCKET_EVENT.NEW_MESSAGE, message);
          this.messageGateway.server
            .to(user.socketId)
            .emit(SOCKET_EVENT.RELOAD_CONVERSATION_LIST);
        }
      }

      return res.status(200).json({ message: 'Upload file thành công' });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async getConversationMessages(conversationId: string, req, res: Response) {
    if (!conversationId) {
      return res.status(500).json({ message: 'Invalid conversation ID' });
    }

    const currentUserId: string = req.user.id;

    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: {
          id: conversationId,
        },
        select: {
          id: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (
        !conversation.members.some((member) => member.userId === currentUserId)
      ) {
        return res
          .status(500)
          .json({ message: 'Bạn không có trong cuộc trò chuyện này' });
      }

      const messages =
        await this.conversationService.findConversationMessage(conversationId);

      return res.status(200).json({ messages: messages });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async getOlderConversationMessages(
    payload: {
      conversationId: string;
      before: Date;
      to?: Date;
    },
    res: Response,
  ) {
    const { conversationId, before, to } = payload;
    try {
      const olderMessages = await this.findOlderMessages(
        conversationId,
        before,
        to,
      );
      return res.status(200).json({
        messages: olderMessages,
      });
    } catch (error) {
      return res.status(500).json({
        message: error.message ?? defaultErrorMessage,
      });
    }
  }

  async recallMessage(messageId: string, res: Response) {
    try {
      const recallMessage = await this.prisma.message.update({
        where: {
          id: messageId,
        },
        data: {
          recall: true,
        },
        include: {
          conversation: {
            select: {
              id: true,
              members: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      });

      if (recallMessage.isPin) {
        await this.unPinMessage(recallMessage.id);
        await this.decreaseNumberOfPins(recallMessage.conversation.id, 1);
      }

      this.sendRecallSocketEvent(
        recallMessage,
        recallMessage.conversation.id,
        recallMessage.conversation.members.map(member => member.userId),
      );

      return res.status(200).json({ message: 'Đã thu hồi tin nhắn' });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async pinMessage(messageId: string) {
    const pinMessage = await this.prisma.message.update({
      where: {
        id: messageId,
      },
      data: {
        isPin: true,
        pinnedAt: new Date(),
      },
      select: MessageBasicSelect,
    });
    await this.increaseNumberOfPins(pinMessage.conversation.id, 1);

    return pinMessage;
  }

  async unPinMessage(messageId: string) {
    const unPinMessage = await this.prisma.message.update({
      where: {
        id: messageId,
      },
      data: {
        isPin: false,
        pinnedAt: null,
      },
      select: MessageBasicSelect,
    });
    await this.decreaseNumberOfPins(unPinMessage.conversation.id, 1);

    return unPinMessage;
  }

  async increaseNumberOfPins(conversationId: string, number: number) {
    const conversation = await this.prisma.conversation.update({
      where: {
        id: conversationId,
      },
      data: {
        numberOfPins: {
          increment: number,
        },
      },
    });
    return conversation;
  }

  async decreaseNumberOfPins(conversationId: string, number: number) {
    const conversation = await this.prisma.conversation.update({
      where: {
        id: conversationId,
      },
      data: {
        numberOfPins: {
          decrement: number,
        },
      },
    });
    return conversation;
  }

  private async createMessage(payload: {
    body: string;
    type: string;
    conversationId: string;
    responseId: string;
    senderId: string;
  }) {
    try {
      let newMessage;
      await this.prisma.$transaction(async (p) => {
        const { body, type, conversationId, responseId, senderId } = payload;
        const message = await p.message.create({
          data: {
            body: body,
            type: type,
            conversationId: conversationId,
            senderId: senderId,
            seenIds: [],
            responseMessageId: responseId,
          },
          include: {
            sender: true,
            responseMessage: {
              select: {
                id: true,
                body: true,
                type: true,
                recall: true,
                sender: {
                  select: UserBasicSelect,
                },
              },
            },
          },
        });

        await p.conversation.update({
          where: {
            id: conversationId,
          },
          data: {
            lastMessageAt: new Date(),
            lastMessageId: message.id,
          },
        });

        newMessage = message;
      });
      return newMessage;
    } catch (error) {
      console.log(error);
      throw new Error(error.message ?? defaultErrorMessage);
    }
  }

  private async findOlderMessages(
    conversationId: string,
    before: Date,
    to?: Date,
  ) {
    const timeRange: { lt: Date; gte?: Date } = {
      lt: before,
    };
    if (to) timeRange.gte = to;

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: conversationId,
        createdAt: timeRange,
      },
      select: MessageBasicSelect,
      orderBy: {
        createdAt: 'desc',
      },
      take: to ? undefined : 10,
    });
    const sortMessages = messages.sort((a, b) => {
      if (a.createdAt.getTime() === b.createdAt.getTime()) return 0;
      if (a.createdAt.getTime() > b.createdAt.getTime()) return 1;
      return -1;
    });
    return sortMessages;
  }

  private uploadFile(file: Express.Multer.File, config: UploadApiOptions) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const uploadPromise = new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(config, (error, result) => {
          if (error) {
            reject(error.message);
          } else {
            resolve(result);
          }
        })
        .end(file.buffer);
    });

    return uploadPromise;
  }

  private async sendRecallSocketEvent(
    recallMessage: any,
    conversationId: string,
    userIds: string[],
  ) {
    userIds.forEach(async (userId) => {
      const { socketId, isOnline } = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          socketId: true,
          isOnline: true,
        },
      });
      if (isOnline) {
        this.messageGateway.server
          .to(socketId)
          .emit(SOCKET_EVENT.RECALL_MESSAGE, conversationId, recallMessage.id);
        this.messageGateway.server
          .to(socketId)
          .emit(SOCKET_EVENT.RELOAD_CONVERSATION_LIST);
        this.messageGateway.server
          .to(socketId)
          .emit(SOCKET_EVENT.UN_PIN_MESSAGE, recallMessage);
      }
    });
  }
}
