export type CreateUserDTO = {
  name: string;
  password: string;
  email: string;
};

export type UpdateUserDTO = {
  name: string;
  email: string;
  image: File;
};

export type SignInDTO = {
  email: string;
  password: string;
};

export type CreateConversationDto = {
  members: {
    id: string;
    name: string;
    email: string;
    image: string;
  }[];
};

export type CreateMessageDto = {
  conversationId: string;
  message: string;
  replyMessageId: string;
  type: string;
};

export type SocketStartCallPayload = {
  conversationId: string;
  type: 'video' | 'voice';
  userId: string;
  isGroup: boolean;
};

export type SocketEndCallPayload = {
  roomId: string;
  conversationId: string;
};

export type SocketJoinRoomPayload = {
  roomId: string;
  userId: string;
};

export type SocketLeftRoomPayload = {
  roomId: string;
};
