import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from 'src/config/db/prisma.service';
import { defaultErrorMessage } from 'src/shared/constants/constants';
import { CreateConversationDto, CreateMessageDto } from 'src/shared/types';
import { MessageGateway } from './message.gateway';
import {
  NEW_MESSAGE_EVENT,
  RECALL_MESSAGE_EVENT,
  RELOAD_CONVERSATION_LIST_EVENT,
  UN_PIN_MESSAGE_EVENT,
} from 'src/shared/constants/socketEventListener';
import {
  MessageBasicSelect,
  UserBasicSelect,
} from 'src/shared/constants/prismaSelector';

import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class MessageService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => MessageGateway))
    private messageGateway: MessageGateway,
  ) {}

  async createConversation(
    dto: CreateConversationDto,
    req: any,
    res: Response,
  ) {
    let newConversation = undefined;
    let currentUserId: string = req.user.id;

    try {
      await this.prisma.$transaction(async (p) => {
        const conversation = await p.conversation.create({
          data: {
            emoji: '',
            isGroup: dto.members.length > 1 ? true : false,
            userIds: [currentUserId, ...dto.members.map((member) => member.id)],
          },
        });

        const lastMessage = await p.message.create({
          data: {
            body: dto.message,
            conversationId: conversation.id,
            seenIds: [],
            senderId: currentUserId,
          },
        });

        await p.conversation.update({
          where: {
            id: conversation.id,
          },
          data: {
            lastMessageId: lastMessage.id,
          },
        });

        newConversation = conversation;
      });

      const { userIds } = await this.prisma.conversation.findUnique({
        where: {
          id: newConversation.id,
        },
        select: {
          userIds: true,
        },
      });

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
            .emit(RELOAD_CONVERSATION_LIST_EVENT);
        }
      });

      return res.status(200).json({
        message: 'Đã gửi tin nhắn',
        conversationId: newConversation.id,
      });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async createNewMessage(dto: CreateMessageDto, req, res: Response) {
    let newMessage = undefined;
    let currentUserId: string = req.user.id;
    try {
      if (dto.message) {
        await this.prisma.$transaction(async (p) => {
          const message = await p.message.create({
            data: {
              body: dto.message,
              type: dto.type,
              conversationId: dto.conversationId,
              senderId: currentUserId,
              seenIds: [],
              responseMessageId: dto.replyMessageId,
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
              id: dto.conversationId,
            },
            data: {
              lastMessageAt: new Date(),
              lastMessageId: message.id,
            },
          });

          newMessage = message;
        });

        const { userIds } = await this.prisma.conversation.findUnique({
          where: {
            id: dto.conversationId,
          },
          select: {
            userIds: true,
          },
        });

        await this.sendNewMessageSocketEvent(newMessage, userIds);
        return res.status(200).json({ message: 'Đã gửi tin nhắn' });
      }
      return res.status(400).json({ message: 'No message content' });
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
      if (file) {
        let newMessage;
        const response = await this.uploadFile(file, conversationId);
        const currentUserId = req.user.id;
        await this.prisma.$transaction(async (p) => {
          const message = await p.message.create({
            data: {
              conversationId: conversationId,
              senderId: currentUserId,
              seenIds: [],
              fileAssetId: response.asset_id,
              fileName: response.display_name,
              fileURL: response.url,
              fileSecureURL: response.secure_url,
              fileSize: response.bytes,
              fileType: response.resource_type,
              type: 'file',
            },
            include: {
              sender: true,
            },
          });

          await p.conversation.update({
            where: {
              id: conversationId,
            },
            data: {
              lastMessageAt: message.createdAt,
              lastMessageId: message.id,
            },
          });

          newMessage = message;
        });

        const { userIds } = await this.prisma.conversation.findUnique({
          where: {
            id: conversationId,
          },
          select: {
            userIds: true,
          },
        });

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
              .emit(NEW_MESSAGE_EVENT, newMessage);
            this.messageGateway.server
              .to(socketId)
              .emit(RELOAD_CONVERSATION_LIST_EVENT);
          }
        });
      }
      return res.status(200).json({ message: 'Upload file thành công' });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async getUserConversation(userId: string, res: Response) {
    try {
      const conversations = await this.prisma.conversation.findMany({
        where: {
          userIds: {
            has: userId,
          },
        },
        select: {
          id: true,
          isGroup: true,
          lastMessageAt: true,
          lastMessage: {
            select: MessageBasicSelect,
          },
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: {
          lastMessageAt: 'desc',
        },
      });
      return res.status(200).json({ data: conversations });
    } catch (error) {
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async getConversationInfo(conversationId: string, req, res: Response) {
    const currentUserId: string = req.user.id;
    if (!conversationId) {
      return res.status(500).json({ message: 'Invalid conversation ID' });
    }
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: {
          id: conversationId,
        },
        select: {
          id: true,
          isGroup: true,
          groupImage: true,
          groupName: true,
          emoji: true,
          lastMessageAt: true,
          lastMessage: {
            select: MessageBasicSelect,
          },
          users: {
            select: {
              id: true,
              name: true,
              image: true,
              email: true,
            },
          },
        },
      });

      if (!conversation.users.some((user) => user.id === currentUserId)) {
        return res
          .status(500)
          .json({ message: 'Bạn không có trong cuộc trò chuyện này' });
      }

      const messages = await this.findConversationMessage(conversation.id);
      const pinMessages = await this.findConversationPinMessage(
        conversation.id,
      );

      return res.status(200).json({
        ...conversation,
        messages: messages,
        pinMessages: pinMessages,
      });
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
          users: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!conversation.users.some((user) => user.id === currentUserId)) {
        return res
          .status(500)
          .json({ message: 'Bạn không có trong cuộc trò chuyện này' });
      }

      const messages = await this.findConversationMessage(conversationId);

      return res.status(200).json({ messages: messages });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async getOlderConversationMessages(
    {
      conversationId,
      before,
      to,
    }: {
      conversationId: string;
      before: Date;
      to?: Date;
    },
    res: Response,
  ) {
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

  async checkConversationExists(userIds: string[], req, res: Response) {
    let currentUserId: string = req.user.id;
    try {
      let existConversation = null;
      const conversations = await this.prisma.conversation.findMany({
        where: {
          userIds: {
            hasSome: [currentUserId],
          },
        },
      });

      // Check if conversation exitst
      for (const conversation of conversations) {
        const arrayA = conversation.userIds.sort();
        const arrayB = [currentUserId, ...userIds].sort();
        if (arrayA.length === arrayB.length) {
          if (arrayA.every((userId, index) => userId === arrayB[index])) {
            existConversation = conversation;
            break;
          }
        }
      }

      if (existConversation && userIds.length !== 0) {
        const messages = await this.findConversationMessage(
          existConversation.id,
        );

        return res.status(200).json({
          isExist: true,
          conversationId: existConversation.id,
          messages: messages,
        });
      }

      return res.status(200).json({
        isExist: false,
        conversationId: null,
        messages: [],
      });
    } catch (error) {
      console.log(error);
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
              userIds: true,
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
        recallMessage.conversation.userIds,
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

  private async findConversationMessage(conversationId: string) {
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: conversationId,
      },
      select: MessageBasicSelect,
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    });
    const sortMessages = messages.sort((a, b) => {
      if (a.createdAt.getTime() === b.createdAt.getTime()) return 0;
      if (a.createdAt.getTime() > b.createdAt.getTime()) return 1;
      return -1;
    });
    return sortMessages;
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

  private async findConversationPinMessage(conversationId) {
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: conversationId,
        isPin: true,
      },
      select: MessageBasicSelect,
      orderBy: {
        pinnedAt: 'desc',
      },
    });
    return messages;
  }

  private uploadFile(file: Express.Multer.File, conversationId: string) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const uploadPromise = new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'auto',
            public_id: file.originalname,
            folder: `/conversation/${conversationId}`,
          },
          (error, result) => {
            if (error) {
              reject(error.message);
            } else {
              resolve(result);
            }
          },
        )
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
          .emit(RECALL_MESSAGE_EVENT, conversationId, recallMessage.id);
        this.messageGateway.server
          .to(socketId)
          .emit(RELOAD_CONVERSATION_LIST_EVENT);
        this.messageGateway.server
          .to(socketId)
          .emit(UN_PIN_MESSAGE_EVENT, recallMessage);
      }
    });
  }

  private async sendNewMessageSocketEvent(newMessage: any, userIds: string[]) {
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
          .emit(NEW_MESSAGE_EVENT, newMessage);
        this.messageGateway.server
          .to(socketId)
          .emit(RELOAD_CONVERSATION_LIST_EVENT);
      }
    });
  }
}
