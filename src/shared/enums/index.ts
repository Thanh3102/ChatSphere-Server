export enum SOCKET_EVENT {
  NEW_MESSAGE = 'newMessage',
  RELOAD_CONVERSATION_LIST = 'reloadConversationList',
  RECALL_MESSAGE = 'recallMessage',
  PIN_MESSAGE = 'pinMessage',
  UN_PIN_MESSAGE = 'unPinMessage',
  CHANGE_CONVERSATION_EMOJI = 'changeConversationEmoji',
  CHANGE_CONVERSATION_GROUP_NAME = 'changeConversationGroupName',
  CHANGE_CONVERSATION_GROUP_IMAGE = 'changeConversationGroupImage',
  CHANGE_USER_NICKNAME = 'changeUserNickname',
  ADD_NEW_MEMBER = 'addNewMember',
  REMOVE_MEMBER = 'removeNewMember',
  MEMBER_LEFT = 'memberLeft',
  MEMBER_ADMIN_PROMOTE = 'memberAdminPromote',
  MEMBER_ADMIN_DOWNGRADE = 'memberAdminDowngrade',
  SET_USER_ID = 'setUserId',
  ERROR = 'error',
  INVITE_CALL = 'inviteCall',
  START_CALL = 'startCall',
  ROOM_CREATED = 'roomCreated',
}
