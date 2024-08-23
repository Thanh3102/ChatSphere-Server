import { UserService } from './../user/user.service';
import { Server, Socket } from 'socket.io';
import {
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  SocketEndCallPayload,
  SocketJoinRoomPayload,
  SocketLeftRoomPayload,
  SocketStartCallPayload,
} from 'src/shared/types';
import { PrismaService } from 'src/config/db/prisma.service';
import {
  MessageBasicSelect,
  UserBasicSelect,
} from 'src/shared/constants/prismaSelector';
import { MessageService } from './message.service';
import { forwardRef, Inject } from '@nestjs/common';
import { SOCKET_EVENT } from 'src/shared/enums';
import { ConversationService } from '../conversation/conversation.service';

@WebSocketGateway(3002, {
  cors: {
    origin: 'http://localhost:3000',
  },
})
export class MessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    @Inject(forwardRef(() => MessageService))
    private messageService: MessageService,
    @Inject(forwardRef(() => ConversationService))
    private conversationService: ConversationService,
    private prisma: PrismaService,
    private userService: UserService,
  ) {}

  @WebSocketServer()
  server: Server;

  @SubscribeMessage('setUserId')
  handleLinkUserId(client: any, payload: any) {
    console.log('Client ID:' + client.id + ' - UserID: ' + payload);
    this.userService.updateSocket(payload, client.id);
  }

  @SubscribeMessage('startCall')
  async handleStartCall(client: Socket, payload: SocketStartCallPayload) {
    console.log(`
      ------- Start Call -------
      Conversation: ${payload.conversationId}
      Type: ${payload.type}
      HostUser: ${payload.userId}
      --------------------------`);

    const room = await this.prisma.room.create({
      data: {
        type: payload.type,
        endedAt: null,
        conversationId: payload.conversationId,
        hostId: payload.userId,
      },
    });

    this.server
      .to(client.id)
      .emit('roomCreated', { roomId: room.id, type: payload.type });

    const callUser = await this.prisma.user.findFirst({
      where: {
        id: payload.userId,
      },
      select: UserBasicSelect,
    });

    // Invite online user in conversation to this room
    const { members } = await this.prisma.conversation.findFirst({
      where: {
        id: payload.conversationId,
      },
      select: {
        members: {
          select: {
            user: {
              select: {
                ...UserBasicSelect,
                isOnline: true,
                socketId: true,
              },
            },
          },
        },
      },
    });

    for (const member of members) {
      if (member.user.id === payload.userId) continue;
      if (member.user.isOnline) {
        this.server.to(member.user.socketId).emit('inviteCall', {
          room: room.id,
          from: {
            name: callUser.name,
            avatar: callUser.image,
          },
          type: payload.type,
        });
      }
    }
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(client: Socket, payload: SocketJoinRoomPayload) {
    /* 
      Cần kiểm tra người dùng có trong conversation của room này không
      Cần kiểm tra người này đã có trong room chưa
    */

    const { user } = await this.prisma.roomParticipant.create({
      data: {
        socketId: client.id,
        roomId: payload.roomId,
        userId: payload.userId,
      },
      include: {
        user: {
          select: UserBasicSelect,
        },
      },
    });

    client.join(payload.roomId);
    client
      .to(payload.roomId)
      .emit('userJoined', { socketId: client.id, user: user });
  }

  @SubscribeMessage('offer')
  async handleOfferSignal(
    client: Socket,
    payload: { socketId: string; signal: any },
  ) {
    const { user } = await this.prisma.roomParticipant.findFirst({
      where: {
        socketId: client.id,
      },
      select: {
        user: {
          select: UserBasicSelect,
        },
      },
    });
    this.server.to(payload.socketId).emit('offer', {
      signal: payload.signal,
      socketId: client.id,
      sender: user,
    });
  }

  @SubscribeMessage('answer')
  async handleAnswerSignal(
    client: Socket,
    payload: { signal: any; socketId: string },
  ) {
    const { user } = await this.prisma.roomParticipant.findFirst({
      where: {
        socketId: client.id,
      },
      select: {
        user: {
          select: UserBasicSelect,
        },
      },
    });

    this.server.to(payload.socketId).emit('answer', {
      signal: payload.signal,
      socketId: client.id,
      sender: user,
    });
  }

  @SubscribeMessage('leftRoom')
  async handleLeftRoom(client: Socket) {
    console.log(`User left room`, client.id);
    const exist = await this.prisma.roomParticipant.findUnique({
      where: {
        socketId: client.id,
      },
    });

    if (exist) {
      const roomParticipant = await this.prisma.roomParticipant.delete({
        where: {
          socketId: client.id,
        },
        include: {
          user: {
            select: UserBasicSelect,
          },
          room: {
            select: {
              id: true,
            },
          },
        },
      });

      const { room, user } = roomParticipant;
      client.to(room.id).emit('userLeft', { user: user });
      client.leave(room.id);

      const participants = await this.prisma.roomParticipant.aggregate({
        where: {
          roomId: room.id,
        },
        _count: {
          id: true,
        },
      });

      console.log('>>> Count', participants._count.id);

      if (participants._count.id === 0) {
        await this.prisma.room.delete({
          where: {
            id: room.id,
          },
        });
      }
    }
  }

  @SubscribeMessage('callDenied')
  async handleDeniedCall(client: Socket, payload) {
    // Xử lý khi người dùng từ chối
  }

  @SubscribeMessage('callEnded')
  handleEndCall(client: Socket, payload: SocketEndCallPayload) {
    console.log(`
      ----- End Call-----
      `);
  }

  @SubscribeMessage('pinMessage')
  async handlePinMessage(client: Socket, payload: { messageId: string }) {
    try {
      const { conversation } = await this.prisma.message.findUnique({
        where: {
          id: payload.messageId,
        },
        select: {
          conversation: {
            select: {
              id: true,
              numberOfPins: true,
              pinLimit: true,
            },
          },
        },
      });

      const { numberOfPins, pinLimit } = conversation;

      if (numberOfPins === pinLimit) {
        this.server
          .to(client.id)
          .emit('error', { message: `Số lượng ghim giới hạn là ${pinLimit}` });
        return;
      }

      await this.prisma.$transaction(async (p) => {
        const pinMessage = await this.messageService.pinMessage(
          payload.messageId,
        );

        const user = await this.userService.getUserBySocketId(client.id);

        const message = await p.message.create({
          data: {
            type: 'notification',
            notificationAction: 'pin',
            conversationId: conversation.id,
            senderId: user.id,
          },
          select: MessageBasicSelect,
        });

        const users = await this.conversationService.findConversationUser(
          conversation.id,
        );

        for (const user of users) {
          if (user.isOnline) {
            this.server
              .to(user.socketId)
              .emit(SOCKET_EVENT.NEW_MESSAGE, message);
            this.server
              .to(user.socketId)
              .emit(SOCKET_EVENT.PIN_MESSAGE, pinMessage);
          }
        }
      });
    } catch (error) {
      console.log(error);
      this.server
        .to(client.id)
        .emit('error', { message: 'Đã xảy ra lỗi. Vui lòng thử lại' });
    }
  }

  @SubscribeMessage('unPinMessage')
  async handleUnPinMessage(client: Socket, payload: { messageId: string }) {
    try {
      const { conversation } = await this.prisma.message.findUnique({
        where: {
          id: payload.messageId,
        },
        select: {
          conversation: {
            select: {
              id: true,
            },
          },
        },
      });

      await this.prisma.$transaction(async (p) => {
        const unPinMessage = await this.messageService.unPinMessage(
          payload.messageId,
        );

        const user = await this.userService.getUserBySocketId(client.id);

        const message = await p.message.create({
          data: {
            type: 'notification',
            notificationAction: 'unPin',
            conversationId: conversation.id,
            senderId: user.id,
          },
          select: MessageBasicSelect,
        });

        const users = await this.conversationService.findConversationUser(
          conversation.id,
        );

        for (const user of users) {
          if (user.isOnline) {
            this.server
              .to(user.socketId)
              .emit(SOCKET_EVENT.NEW_MESSAGE, message);
            this.server
              .to(user.socketId)
              .emit(SOCKET_EVENT.UN_PIN_MESSAGE, unPinMessage);
          }
        }
      });
    } catch (error) {
      console.log(error);
      this.server
        .to(client.id)
        .emit('error', { message: 'Đã xảy ra lỗi. Vui lòng thử lại' });
    }
  }

  handleConnection(client: any) {
    console.log('Client connect:', client.id);
    this.userService.clearSocket(client.id);
  }

  handleDisconnect(client: any) {
    console.log('Client disconnect:', client.id);
    this.userService.clearSocket(client.id);
  }
}
