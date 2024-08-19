export const UserBasicSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
};

export const UserDetailSelect = {
  id: true,
  email: true,
  image: true,
  createAt: true,
  lastEditAt: true,
};

export const MessageBasicSelect = {
  id: true,
  type: true,
  body: true,
  createdAt: true,
  isTranfer: true,
  isPin: true,
  pinnedAt: true,
  recall: true,
  status: true,
  fileType: true,
  fileName: true,
  fileURL: true,
  fileSecureURL: true,
  fileSize: true,
  voiceDuration: true,
  notificationAction: true,
  notificationTarget: true,
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
  seen: {
    select: UserBasicSelect,
  },
  sender: {
    select: UserBasicSelect,
  },
  conversation: {
    select: {
      id: true,
    },
  },
};
