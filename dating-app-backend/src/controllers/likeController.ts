import { Op } from 'sequelize';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Like, User, Photo, Message } from '../models';
import {
  ensureMatchForUsers,
  findMatchByUsers,
  serializeMatchForViewer,
  MATCH_STAGE
} from '../services/matchService';
import { buildImUserId, sendTextMessageAsUser } from '../services/easemobService';
import { hasDiscoverVipAccess, hasSuperLikeAccess } from '../services/vipService';

const DEFAULT_MATCH_MESSAGE = '你好，我们可以开始聊天了！';

const buildUserCard = (user: any) => ({
  id: user.id,
  im_user_id: user.im_user_id || null,
  username: user.nickname || user.username,
  nickname: user.nickname || user.username,
  gender: user.gender,
  birth_date: user.birth_date,
  hometown: user.hometown || '',
  job: user.job || '',
  photo: user.photos?.[0]?.url || user.avatar_url || null
});

const attachMatchToItems = async (params: {
  viewerId: string;
  items: any[];
  getOtherUser: (item: any) => any;
  mapBase: (item: any, matchPayload: any) => any;
}) => {
  const { viewerId, items, getOtherUser, mapBase } = params;

  return Promise.all(
    (items || []).map(async (item: any) => {
      const otherUser = getOtherUser(item);
      const match = otherUser?.id ? await findMatchByUsers(viewerId, otherUser.id) : null;
      const matchPayload = match
        ? serializeMatchForViewer({
            match,
            viewerId,
            otherUser
          })
        : null;

      return mapBase(item, matchPayload);
    })
  );
};

const ensureImUserId = async (user: any) => {
  if (!user) return '';
  const current = String(user.im_user_id || '').trim();
  if (current) return current;

  const imUserId = buildImUserId(String(user.id || ''));
  await user.update({ im_user_id: imUserId } as any);
  user.setDataValue('im_user_id', imUserId);
  return imUserId;
};

export const toggleLike = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const rawTargetId = (req.params as any).targetId as string | string[] | undefined;
    const targetId = Array.isArray(rawTargetId) ? rawTargetId[0] : rawTargetId;
    const mode = String(req.body?.mode || 'like').trim();
    const isSuperLike = mode === 'super_like';

    if (!targetId) {
      return res.status(400).json({ success: false, message: 'Missing targetId' });
    }

    if (String(userId) === String(targetId)) {
      return res.status(400).json({ success: false, message: 'Cannot like yourself' });
    }

    const existingLike = await Like.findOne({
      where: { user_id: userId, target_id: targetId }
    });

    if (existingLike) {
      await existingLike.destroy();
      return res.status(200).json({ success: true, message: 'Unliked', liked: false });
    }

    if (isSuperLike) {
      const hasAccess = await hasSuperLikeAccess(userId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          code: 'SUPER_LIKE_REQUIRED',
          message: 'Super like entitlement required'
        });
      }
    }

    await Like.create({ user_id: userId, target_id: targetId });

    const [currentUser, targetUser, mutual] = await Promise.all([
      User.findByPk(userId, {
        attributes: ['id', 'username', 'nickname', 'gender', 'im_user_id'] as any
      }),
      User.findByPk(targetId, {
        attributes: ['id', 'username', 'nickname', 'gender', 'im_user_id'] as any
      }),
      Like.findOne({ where: { user_id: targetId, target_id: userId } })
    ]);

    let matchPayload = null;
    let autoMessageSent = false;
    let peerImUserId: string | null = null;
    if (mutual && currentUser && targetUser) {
      const [senderImUserId, receiverImUserId] = await Promise.all([
        ensureImUserId(currentUser),
        ensureImUserId(targetUser)
      ]);
      const match = await ensureMatchForUsers(currentUser, targetUser);
      const matchUpdates: Record<string, any> = {};
      if (String(match.getDataValue('stage') || '') !== MATCH_STAGE.CHAT_STARTED) {
        matchUpdates.stage = MATCH_STAGE.CHAT_STARTED;
      }
      if (!match.getDataValue('chat_started_at')) {
        matchUpdates.chat_started_at = new Date();
      }

      if (Object.keys(matchUpdates).length) {
        await match.update(matchUpdates);
      }

      if (!match.getDataValue('chat_start_message_sent')) {
        try {
          await sendTextMessageAsUser({
            from: senderImUserId,
            to: receiverImUserId,
            text: DEFAULT_MATCH_MESSAGE
          });
          await Message.create({
            sender_id: currentUser.id,
            receiver_id: targetUser.id,
            content: DEFAULT_MATCH_MESSAGE,
            message_type: 'system',
            is_read: false
          } as any);
          await match.update({
            chat_start_message_sent: true,
            stage: MATCH_STAGE.CHAT_STARTED,
            chat_started_at: match.getDataValue('chat_started_at') || new Date()
          });
          autoMessageSent = true;
        } catch (imError: any) {
          console.error('[Like] auto match message failed:', imError?.message || imError);
        }
      } else {
        autoMessageSent = true;
      }

      peerImUserId = receiverImUserId || null;
      matchPayload = serializeMatchForViewer({
        match,
        viewerId: userId,
        otherUser: targetUser
      });
    }

    return res.status(200).json({
      success: true,
      message: isSuperLike ? 'Super liked' : 'Liked',
      liked: true,
      matched: !!matchPayload,
      match: matchPayload,
      mode: isSuperLike ? 'super_like' : 'like',
      auto_message_sent: autoMessageSent,
      peer_im_user_id: peerImUserId,
      peer_user: targetUser ? buildUserCard(targetUser) : null
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getLikedBy = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const hasVipAccess = await hasDiscoverVipAccess(userId);
    const likes = await Like.findAll({
      where: { target_id: userId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'nickname', 'gender', 'birth_date', 'avatar_url', 'hometown', 'job', 'im_user_id'],
        include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
      }],
      order: [['created_at', 'DESC']]
    });

    if (!hasVipAccess) {
      const data = likes.map((like: any) => ({
        id: like.id,
        created_at: like.created_at,
        locked: true,
        user: {
          photo: like.user?.photos?.[0]?.url || like.user?.avatar_url || null
        }
      }));

      return res.status(200).json({
        success: true,
        data,
        meta: {
          viewer_has_vip: false,
          total: data.length
        }
      });
    }

    const data = await attachMatchToItems({
      viewerId: userId,
      items: likes,
      getOtherUser: (like: any) => like.user,
      mapBase: (like: any, matchPayload: any) => ({
        id: like.id,
        user: buildUserCard(like.user),
        created_at: like.created_at,
        is_match: !!matchPayload,
        match: matchPayload
      })
    });

    return res.status(200).json({
      success: true,
      data,
      meta: {
        viewer_has_vip: true,
        total: data.length
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMatches = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    const myLikes = await Like.findAll({ where: { user_id: userId }, attributes: ['target_id'] });
    const targets = myLikes.map((l: any) => l.target_id);
    if (targets.length === 0) return res.status(200).json({ success: true, data: [] });

    const mutualLikes = await Like.findAll({
      where: {
        user_id: { [Op.in]: targets },
        target_id: userId
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'nickname', 'gender', 'birth_date', 'avatar_url', 'hometown', 'job', 'im_user_id'],
        include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
      }],
      order: [['created_at', 'DESC']]
    });

    const data = await attachMatchToItems({
      viewerId: userId,
      items: mutualLikes,
      getOtherUser: (like: any) => like.user,
      mapBase: (like: any, matchPayload: any) => ({
        user: buildUserCard(like.user),
        matched_at: like.created_at,
        match: matchPayload
      })
    });

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getLikeStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    const [likedByMe, likedMe] = await Promise.all([
      Like.findAll({ where: { user_id: userId }, attributes: ['target_id'] }),
      Like.findAll({ where: { target_id: userId }, attributes: ['user_id'] })
    ]);

    const likedByMeIds = new Set(likedByMe.map((l: any) => String(l.target_id)));
    const likedMeIds = new Set(likedMe.map((l: any) => String(l.user_id)));

    let mutualCount = 0;
    likedByMeIds.forEach((id) => {
      if (likedMeIds.has(id)) mutualCount += 1;
    });

    const totalLikedByMe = likedByMeIds.size;
    const totalLikedMe = likedMeIds.size;
    const newCount = Math.max(0, totalLikedMe - mutualCount);

    return res.status(200).json({
      success: true,
      data: { mutualCount, newCount, totalLikedByMe, totalLikedMe }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyLikes = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const likes = await Like.findAll({
      where: { user_id: userId },
      include: [{
        model: User,
        as: 'target_user',
        attributes: ['id', 'username', 'nickname', 'gender', 'birth_date', 'hometown', 'job', 'avatar_url', 'im_user_id'],
        include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
      }]
    });

    const data = await attachMatchToItems({
      viewerId: userId,
      items: likes,
      getOtherUser: (like: any) => like.target_user,
      mapBase: (like: any, matchPayload: any) => ({
        id: like.id,
        user: buildUserCard(like.target_user),
        created_at: like.created_at,
        is_match: !!matchPayload,
        match: matchPayload
      })
    });

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
