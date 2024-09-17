import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/config/db/prisma.service';
import { MessageGateway } from '../message/message.gateway';
import { CreateConversationDto } from 'src/shared/types';
import { Response } from 'express';
import { defaultErrorMessage } from 'src/shared/constants/constants';
import {
  MessageBasicSelect,
  UserBasicSelect,
} from 'src/shared/constants/prismaSelector';
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
      const memberIds = [
        currentUserId,
        ...dto.members.map((member) => member.id),
      ];
      const members = memberIds.map((memberId) => {
        if (memberId === currentUserId) {
          return { userId: memberId, addedBy: currentUserId, role: 'owner' };
        }
        return { userId: memberId, addedBy: currentUserId };
      });

      await this.prisma.$transaction(async (p) => {
        const conversation = await p.conversation.create({
          data: {
            isGroup: dto.members.length > 1 ? true : false,
            createdBy: currentUserId,
            members: {
              create: members,
            },
            groupMaxMember: dto.members.length > 1 ? 250 : undefined,
            groupNumberOfMember:
              dto.members.length > 1 ? dto.members.length + 1 : undefined,
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
          members: {
            some: {
              userId: userId,
            },
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
          members: {
            select: {
              id: true,
              user: {
                select: UserBasicSelect,
              },
              addedUser: {
                select: UserBasicSelect,
              },
              joinedAt: true,
              nickName: true,
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
          groupNumberOfMember: true,
          groupMaxMember: true,
          lastMessageAt: true,
          lastMessage: {
            select: MessageBasicSelect,
          },
          members: {
            select: {
              id: true,
              user: {
                select: UserBasicSelect,
              },
              addedUser: {
                select: UserBasicSelect,
              },
              joinedAt: true,
              nickName: true,
              role: true,
            },
            orderBy: {
              role: 'asc',
            },
          },
        },
      });

      const rolePriority = {
        owner: 1,
        admin: 2,
        member: 3,
      };

      let sortMemberByRole = [];

      if (conversation.members.length !== 0) {
        sortMemberByRole = conversation.members.sort((a, b) => {
          return rolePriority[a.role] - rolePriority[b.role];
        });
      }

      if (
        !conversation.members.some((member) => member.user.id === currentUserId)
      ) {
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
        members: sortMemberByRole,
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
      const { members } = await this.prisma.conversation.findUnique({
        where: {
          id: conversationId,
        },
        select: {
          members: {
            select: {
              user: {
                select: {
                  id: true,
                  isOnline: true,
                  socketId: true,
                },
              },
            },
          },
        },
      });
      let users: { id: string; isOnline: boolean; socketId: string }[] = [];
      for (const member of members) {
        users.push({ ...member.user });
      }
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
          members: {
            some: {
              userId: currentUserId,
            },
          },
        },
        include: {
          members: true,
        },
      });

      // Check if conversation exitst
      for (const conversation of conversations) {
        const arrayA = conversation.members.map((member) => member.userId).sort();
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

  async addNewMember(
    payload: {
      newMemberIds: string[];
      addedUserId: string;
      conversationId: string;
    },
    res: Response,
  ) {
    const { newMemberIds, addedUserId, conversationId } = payload;
    const { groupMaxMember, groupNumberOfMember } =
      await this.prisma.conversation.findUnique({
        where: {
          id: conversationId,
        },
        select: {
          groupNumberOfMember: true,
          groupMaxMember: true,
        },
      });

    if (groupNumberOfMember + newMemberIds.length > groupMaxMember)
      return res.status(409).json({
        message: `Số người tối đã trong nhóm chat là ${groupMaxMember}`,
      });

    for (const newMemberId of newMemberIds) {
      const member = await this.prisma.conversationMember.create({
        data: {
          addedBy: addedUserId,
          conversationId: conversationId,
          userId: newMemberId,
        },
        include: {
          user: {
            select: UserBasicSelect,
          },
          addedUser: {
            select: UserBasicSelect,
          },
          nickNameChangedUser: {
            select: UserBasicSelect,
          },
        },
      });

      const message = await this.prisma.message.create({
        data: {
          type: 'notification',
          notificationAction: 'addMember',
          notificationTarget: member.user.name,
          senderId: addedUserId,
          conversationId: conversationId,
        },
        select: MessageBasicSelect,
      });

      const users = await this.findConversationUser(conversationId);

      for (const user of users) {
        if (user.isOnline) {
          this.messageGateway.server
            .to(user.socketId)
            .emit(SOCKET_EVENT.ADD_NEW_MEMBER, { member: member });
          this.messageGateway.server
            .to(user.socketId)
            .emit(SOCKET_EVENT.NEW_MESSAGE, message);
        }
      }
    }

    await this.prisma.conversation.update({
      where: {
        id: conversationId,
      },
      data: {
        groupNumberOfMember: {
          increment: newMemberIds.length,
        },
      },
    });

    return res.status(200).json({});
  }

  async removeMember(
    payload: {
      removeId: string;
      removeUserId: string;
      conversationId: string;
    },
    res: Response,
  ) {
    const { removeUserId, removeId, conversationId } = payload;

    const member = await this.prisma.conversationMember.delete({
      where: {
        id: removeId,
      },
      include: {
        user: {
          select: UserBasicSelect,
        },
        addedUser: {
          select: UserBasicSelect,
        },
        nickNameChangedUser: {
          select: UserBasicSelect,
        },
      },
    });

    const message = await this.prisma.message.create({
      data: {
        type: 'notification',
        notificationAction: 'removeMember',
        notificationTarget: member.user.name,
        senderId: removeUserId,
        conversationId: conversationId,
      },
      select: MessageBasicSelect,
    });

    const users = await this.findConversationUser(conversationId);

    for (const user of users) {
      if (user.isOnline) {
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.REMOVE_MEMBER, { member: member });
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.NEW_MESSAGE, message);
      }
    }

    await this.prisma.conversation.update({
      where: {
        id: conversationId,
      },
      data: {
        groupNumberOfMember: {
          decrement: 1,
        },
      },
    });

    return res.status(200).json({});
  }

  async promoteMember(memberId: string, req, res: Response) {
    const member = await this.prisma.conversationMember.update({
      where: {
        id: memberId,
      },
      data: {
        role: 'admin',
      },
      include: {
        user: {
          select: UserBasicSelect,
        },
        addedUser: {
          select: UserBasicSelect,
        },
        nickNameChangedUser: {
          select: UserBasicSelect,
        },
      },
    });

    const message = await this.prisma.message.create({
      data: {
        type: 'notification',
        notificationAction: 'promoteMember',
        notificationTarget: member.user.name,
        senderId: req.user.id,
        conversationId: member.conversationId,
      },
      select: MessageBasicSelect,
    });

    const users = await this.findConversationUser(member.conversationId);

    for (const user of users) {
      if (user.isOnline) {
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.MEMBER_ADMIN_PROMOTE, { memberId: member.id });
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.NEW_MESSAGE, message);
      }
    }
  }

  async downgradeMember(memberId: string, req, res: Response) {
    const member = await this.prisma.conversationMember.update({
      where: {
        id: memberId,
      },
      data: {
        role: 'member',
      },
      include: {
        user: {
          select: UserBasicSelect,
        },
        addedUser: {
          select: UserBasicSelect,
        },
        nickNameChangedUser: {
          select: UserBasicSelect,
        },
      },
    });

    const message = await this.prisma.message.create({
      data: {
        type: 'notification',
        notificationAction: 'downgradeMember',
        notificationTarget: member.user.name,
        senderId: req.user.id,
        conversationId: member.conversationId,
      },
      select: MessageBasicSelect,
    });

    const users = await this.findConversationUser(member.conversationId);

    for (const user of users) {
      if (user.isOnline) {
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.MEMBER_ADMIN_DOWNGRADE, { memberId: member.id });
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.NEW_MESSAGE, message);
      }
    }
  }

  async leftConversation(memberId: string, res: Response) {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        id: memberId,
      },
      include: {
        user: { select: UserBasicSelect },
      },
    });

    await this.prisma.conversationMember.delete({
      where: {
        id: memberId,
      },
    });

    const users = await this.findConversationUser(member.conversationId);

    const message = await this.prisma.message.create({
      data: {
        type: 'notification',
        notificationAction: 'leftGroup',
        notificationTarget: member.user.name,
        senderId: member.user.id,
        conversationId: member.conversationId,
      },
      select: MessageBasicSelect,
    });

    for (const user of users) {
      if (user.isOnline) {
        if (user.id === member.user.id) {
          this.messageGateway.server
            .to(user.socketId)
            .emit(SOCKET_EVENT.RELOAD_CONVERSATION_LIST);
        }
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.MEMBER_LEFT, {
            memberId: member.id,
          });
        this.messageGateway.server
          .to(user.socketId)
          .emit(SOCKET_EVENT.NEW_MESSAGE, message);
      }
    }

    const adminMembers = await this.prisma.conversationMember.findMany({
      where: {
        conversationId: member.conversationId,
        role: 'admin',
      },
      include: {
        user: {
          select: UserBasicSelect,
        },
      },
    });

    if (adminMembers.length == 0) {
      const members = await this.prisma.conversationMember.findMany({
        where: {
          conversationId: member.conversationId,
          id: {
            not: member.id,
          },
        },
        include: {
          user: { select: UserBasicSelect },
        },
      });

      if (members.length !== 0) {
        const membersSort = members.sort((a, b) => {
          if (a.joinedAt.getTime() > b.joinedAt.getTime()) return 1;
          if (a.joinedAt.getTime() < b.joinedAt.getTime()) return -1;
          return 0;
        });

        await this.prisma.conversationMember.update({
          where: {
            id: membersSort[0].id,
          },
          data: {
            role: 'admin',
          },
        });

        const message = await this.prisma.message.create({
          data: {
            type: 'notification',
            notificationAction: 'promoteMember',
            notificationTarget: membersSort[0].user.name,
            senderId: member.user.id,
            conversationId: member.conversationId,
          },
          select: MessageBasicSelect,
        });

        for (const user of users) {
          if (user.isOnline) {
            this.messageGateway.server
              .to(user.socketId)
              .emit(SOCKET_EVENT.MEMBER_ADMIN_PROMOTE, {
                memberId: membersSort[0].id,
              });
            this.messageGateway.server
              .to(user.socketId)
              .emit(SOCKET_EVENT.NEW_MESSAGE, message);
          }
        }
      }
    }

    return res.status(200).json({});
  }
}
