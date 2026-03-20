import { Op } from 'sequelize';
import { Block, ConversationSummary, Message, User } from '../models';

type MessageType = 'text' | 'image' | 'voice' | 'system';
type Direction = 'send' | 'receive';

const normalizeMessageType = (value: unknown): MessageType => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'image' || raw === 'voice' || raw === 'system') return raw;
  return 'text';
};

const normalizeDirection = (value: unknown): Direction => {
  return String(value || '').trim().toLowerCase() === 'receive' ? 'receive' : 'send';
};

export const resolveUserByTarget = async (target: string) => {
  const normalized = String(target || '').trim();
  if (!normalized) return null;

  return User.findOne({
    where: {
      [Op.or]: [
        { id: normalized },
        { im_user_id: normalized }
      ]
    }
  });
};

export const upsertConversationSummary = async (params: {
  userId: string;
  peerUserId: string;
  peerImUserId?: string | null;
  content: string;
  messageType?: MessageType | string;
  direction?: Direction | string;
  unreadCount?: number;
  incrementUnread?: boolean;
  lastMessageAt?: Date;
  isBlocked?: boolean;
}) => {
  const {
    userId,
    peerUserId,
    peerImUserId = null,
    content,
    messageType = 'text',
    direction = 'send',
    unreadCount,
    incrementUnread = false,
    lastMessageAt = new Date(),
    isBlocked = false
  } = params;

  const existing = await ConversationSummary.findOne({
    where: {
      user_id: userId,
      peer_user_id: peerUserId
    }
  });

  const nextUnreadCount = typeof unreadCount === 'number'
    ? Math.max(0, unreadCount)
    : Math.max(0, Number(existing?.getDataValue('unread_count') || 0) + (incrementUnread ? 1 : 0));

  const payload = {
    peer_im_user_id: peerImUserId || existing?.getDataValue('peer_im_user_id') || null,
    chat_type: 'singleChat',
    last_message_content: String(content || '').trim(),
    last_message_type: normalizeMessageType(messageType),
    last_message_direction: normalizeDirection(direction),
    last_message_at: lastMessageAt,
    unread_count: nextUnreadCount,
    is_blocked: !!isBlocked
  };

  if (existing) {
    await existing.update(payload);
    return existing;
  }

  return ConversationSummary.create({
    user_id: userId,
    peer_user_id: peerUserId,
    ...payload
  } as any);
};

export const recordConversationMessage = async (params: {
  senderId: string;
  receiverId: string;
  content: string;
  messageType?: MessageType | string;
  createdAt?: Date;
}) => {
  const { senderId, receiverId, content, messageType = 'text', createdAt = new Date() } = params;
  const normalizedContent = String(content || '').trim();
  const normalizedType = normalizeMessageType(messageType);

  if (!normalizedContent) {
    throw new Error('Message content is required');
  }

  const [sender, receiver, senderBlocked, receiverBlocked] = await Promise.all([
    User.findByPk(senderId),
    User.findByPk(receiverId),
    Block.findOne({ where: { user_id: senderId, target_id: receiverId } }),
    Block.findOne({ where: { user_id: receiverId, target_id: senderId } })
  ]);

  if (!sender || !receiver) {
    throw new Error('User not found');
  }

  const message = await Message.create({
    sender_id: senderId,
    receiver_id: receiverId,
    content: normalizedContent,
    message_type: normalizedType,
    is_read: false,
    created_at: createdAt
  } as any);

  await Promise.all([
    upsertConversationSummary({
      userId: senderId,
      peerUserId: receiverId,
      peerImUserId: receiver.getDataValue('im_user_id') || null,
      content: normalizedContent,
      messageType: normalizedType,
      direction: 'send',
      unreadCount: 0,
      lastMessageAt: createdAt,
      isBlocked: !!senderBlocked
    }),
    upsertConversationSummary({
      userId: receiverId,
      peerUserId: senderId,
      peerImUserId: sender.getDataValue('im_user_id') || null,
      content: normalizedContent,
      messageType: normalizedType,
      direction: 'receive',
      incrementUnread: true,
      lastMessageAt: createdAt,
      isBlocked: !!receiverBlocked
    })
  ]);

  return message;
};

export const markConversationRead = async (params: {
  userId: string;
  peerUserId: string;
}) => {
  const { userId, peerUserId } = params;

  await Promise.all([
    Message.update(
      { is_read: true },
      {
        where: {
          sender_id: peerUserId,
          receiver_id: userId,
          is_read: false
        }
      }
    ),
    ConversationSummary.update(
      { unread_count: 0 },
      {
        where: {
          user_id: userId,
          peer_user_id: peerUserId
        }
      }
    )
  ]);
};

export const backfillConversationSummariesForUser = async (userId: string) => {
  const messages = await Message.findAll({
    where: {
      [Op.or]: [
        { sender_id: userId },
        { receiver_id: userId }
      ]
    },
    order: [['created_at', 'DESC']]
  });

  const peerIds = new Set<string>();
  messages.forEach((message: any) => {
    const senderId = String(message.sender_id || '');
    const receiverId = String(message.receiver_id || '');
    const peerId = senderId === String(userId) ? receiverId : senderId;
    if (peerId) peerIds.add(peerId);
  });

  await Promise.all(Array.from(peerIds).map(async (peerId) => {
    const existing = await ConversationSummary.findOne({
      where: {
        user_id: userId,
        peer_user_id: peerId
      }
    });
    if (existing) return;

    const peer = await User.findByPk(peerId);
    const lastMessage = messages.find((message: any) => (
      String(message.sender_id) === peerId || String(message.receiver_id) === peerId
    ));
    if (!lastMessage) return;

    const unreadCount = messages.filter((message: any) => (
      String(message.sender_id) === peerId &&
      String(message.receiver_id) === String(userId) &&
      !message.is_read
    )).length;
    const blocked = await Block.findOne({ where: { user_id: userId, target_id: peerId } });

    await upsertConversationSummary({
      userId,
      peerUserId: peerId,
      peerImUserId: peer?.getDataValue('im_user_id') || null,
      content: String(lastMessage.content || ''),
      messageType: lastMessage.message_type || 'text',
      direction: String(lastMessage.sender_id) === String(userId) ? 'send' : 'receive',
      unreadCount,
      lastMessageAt: lastMessage.created_at || new Date(),
      isBlocked: !!blocked
    });
  }));
};
