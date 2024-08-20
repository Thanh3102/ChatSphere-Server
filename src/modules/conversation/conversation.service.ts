import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/config/db/prisma.service';
import { MessageGateway } from '../message/message.gateway';
import { CreateConversationDto } from 'src/shared/types';
import { Response } from 'express';
import { defaultErrorMessage } from 'src/shared/constants/constants';
import { MessageBasicSelect } from 'src/shared/constants/prismaSelector';
import { SOCKET_EVENT } from 'src/shared/enums';
import { CloudinaryService } from 'src/utils/cloudinary.service';

@Injectable()
export class ConversationService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => MessageGateway))
    private messageGateway: MessageGateway,
    private cloudinaryService: CloudinaryService,
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
            isGroup: dto.members.length > 1 ? true : false,
            userIds: [currentUserId, ...dto.members.map((member) => member.id)],
          },
        });
        newConversation = conversation;
      });
      return res.status(200).json({
        id: newConversation.id,
      });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async getUserConversations(userId: string, res: Response) {
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
          groupImage: true,
          groupName: true,
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
      const mediaFiles = await this.findConversationMediaFile({
        conversationId: conversation.id,
      });

      const files = await this.findConversationFile({
        conversationId: conversation.id,
      });

      return res.status(200).json({
        ...conversation,
        messages: messages,
        pinMessages: pinMessages,
        mediaFiles: mediaFiles,
        files: files,
      });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async findConversationUser(conversationId: string) {
    try {
      const { users } = await this.prisma.conversation.findUnique({
        where: {
          id: conversationId,
        },
        select: {
          users: {
            select: {
              id: true,
              isOnline: true,
              socketId: true,
            },
          },
        },
      });
      return users;
    } catch (error) {
      console.log(error);
      return [];
    }
  }

  async findConversationMediaFile(payload: {
    conversationId: string;
    before?: Date;
  }) {
    const { conversationId, before } = payload;
    try {
      const files = await this.prisma.message.findMany({
        where: {
          conversationId: conversationId,
          type: 'file',
          recall: false,
          OR: [
            {
              fileType: {
                startsWith: 'image',
              },
            },
            {
              fileType: {
                startsWith: 'video',
              },
            },
          ],
          createdAt: {
            lt: before,
          },
        },
        select: MessageBasicSelect,
        orderBy: {
          createdAt: 'desc',
        },
        take: 30,
      });
      return files;
    } catch (error) {
      console.log(error);
      return [];
    }
  }

  async findConversationFile(payload: {
    conversationId: string;
    before?: Date;
  }) {
    const { conversationId, before } = payload;
    try {
      const files = await this.prisma.message.findMany({
        where: {
          conversationId: conversationId,
          type: 'file',
          recall: false,
          AND: [
            {
              fileType: {
                not: {
                  startsWith: 'image',
                },
              },
            },
            {
              fileType: {
                not: {
                  startsWith: 'video',
                },
              },
            },
          ],
          createdAt: {
            lt: before,
          },
        },
        select: MessageBasicSelect,
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      });
      return files;
    } catch (error) {
      console.log(error);
      return [];
    }
  }

  async findConversationPinMessage(conversationId) {
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

  async findConversationMessage(conversationId: string) {
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

  async getConversationFile(
    payload: {
      conversationId: string;
      type: 'file' | 'mediaFile';
      before?: Date;
    },
    res: Response,
  ) {
    const { conversationId, before, type } = payload;
    try {
      let files = [];
      if (type === 'mediaFile') {
        files = await this.findConversationMediaFile({
          conversationId: conversationId,
          before: before,
        });
      }

      if (type === 'file') {
        files = await this.findConversationFile({
          conversationId: conversationId,
          before: before,
        });
      }

      return res.status(200).json(files);
    } catch (error) {
      return res
        .status(200)
        .json({ message: error.message ?? defaultErrorMessage });
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

  async updateConversationSetting(
    dto: {
      id: string;
      emoji?: string;
      groupName?: string;
      groupImage?: Express.Multer.File;
    },
    req,
    res: Response,
  ) {
    try {
      const { id, emoji, groupName, groupImage } = dto;

      if (!id) throw new BadRequestException('Required conversation id');

      if (emoji) {
        await this.changeConversationEmoji(id, emoji, req.user.id);
      }

      if (groupName) {
        this.changeConversationName(id, groupName, req.user.id);
      }

      if (groupImage) {
        this.changeConversationImage(id, groupImage, req.user.id);
      }

      return res.status(200).json({});
    } catch (error) {
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async changeConversationEmoji(id: string, emoji: string, senderId: string) {
    await this.prisma.conversation.update({
      where: {
        id: id,
      },
      data: {
        emoji: emoji,
      },
    });

    const message = await this.prisma.message.create({
      data: {
        type: 'notification',
        notificationAction: 'changeEmoji',
        notificationTarget: emoji,
        conversationId: id,
        seenIds: [],
        senderId: senderId,
      },
      select: MessageBasicSelect,
    });

    const users = await this.findConversationUser(id);
    for (const user of users) {
      if (user.isOnline) {
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.CHANGE_CONVERSATION_EMOJI, { emoji: emoji });
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.NEW_MESSAGE, message);
      }
    }
  }

  async changeConversationName(id: string, name: string, senderId: string) {
    await this.prisma.conversation.update({
      where: {
        id: id,
      },
      data: {
        groupName: name,
      },
    });

    const message = await this.prisma.message.create({
      data: {
        type: 'notification',
        notificationAction: 'changeGroupName',
        notificationTarget: name,
        conversationId: id,
        seenIds: [],
        senderId: senderId,
      },
      select: MessageBasicSelect,
    });

    const users = await this.findConversationUser(id);

    for (const user of users) {
      if (user.isOnline) {
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.CHANGE_CONVERSATION_GROUP_NAME, name);
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.NEW_MESSAGE, message);
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.RELOAD_CONVERSATION_LIST);
      }
    }
  }

  async changeConversationImage(
    id: string,
    image: Express.Multer.File,
    senderId: string,
  ) {
    const response = await this.cloudinaryService.uploadFile(image, {
      folder: `/conversation/${id}/groupAvatar`,
      public_id: `groupAvatar-${Date.now().toString()}`,
      resource_type: 'auto',
    });

    await this.prisma.conversation.update({
      where: {
        id: id,
      },
      data: {
        groupImage: response.url,
        groupImageAssetId: response.assetId,
      },
    });

    const message = await this.prisma.message.create({
      data: {
        type: 'notification',
        notificationAction: 'changeGroupImage',
        conversationId: id,
        seenIds: [],
        senderId: senderId,
      },
      select: MessageBasicSelect,
    });

    const users = await this.findConversationUser(id);

    for (const user of users) {
      if (user.isOnline) {
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.CHANGE_CONVERSATION_GROUP_IMAGE, response.url);
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.NEW_MESSAGE, message);
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.RELOAD_CONVERSATION_LIST);
      }
    }
  }
}
