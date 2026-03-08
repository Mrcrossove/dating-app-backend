import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Like, User, Message, Photo, Match } from '../models';
import { Op } from 'sequelize';

const orderPair = (a: string, b: string) => (String(a) < String(b) ? [a, b] : [b, a]);

export const toggleLike = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { targetId } = req.params;

    if (String(userId) === String(targetId)) {
        return res.status(400).json({ success: false, message: 'Cannot like yourself' });
    }

    const existingLike = await Like.findOne({
      where: { user_id: userId, target_id: targetId }
    });

    if (existingLike) {
      await existingLike.destroy();
      return res.status(200).json({ success: true, message: 'Unliked', liked: false });
    } else {
      await Like.create({ user_id: userId, target_id: targetId });

      // Create match if mutual like
      const mutual = await Like.findOne({ where: { user_id: targetId, target_id: userId } });
      if (mutual) {
        const [user1Id, user2Id] = orderPair(String(userId), String(targetId));
        await Match.findOrCreate({
          where: { user1_id: user1Id, user2_id: user2Id },
          defaults: { user1_id: user1Id, user2_id: user2Id, compatibility_score: 50, status: 'active' }
        }).catch(() => undefined);
      }

      // Send a system message or auto-message
      await Message.create({
          sender_id: userId,
          receiver_id: targetId,
          content: '我关注了你 ❤️',
          message_type: 'system',
          is_read: false
      });

      return res.status(200).json({ success: true, message: 'Liked', liked: true });
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getLikedBy = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const likes = await Like.findAll({
      where: { target_id: userId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'nickname', 'gender', 'birth_date', 'avatar_url'],
        include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
      }],
      order: [['created_at', 'DESC']]
    });

    const data = likes.map((like: any) => ({
      id: like.id,
      user: {
        id: like.user.id,
        username: like.user.nickname || like.user.username,
        gender: like.user.gender,
        birth_date: like.user.birth_date,
        photo: like.user.photos?.[0]?.url || like.user.avatar_url || null
      },
      created_at: like.created_at
    }));

    return res.status(200).json({ success: true, data });
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
        attributes: ['id', 'username', 'nickname', 'gender', 'birth_date', 'avatar_url'],
        include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
      }],
      order: [['created_at', 'DESC']]
    });

    const data = mutualLikes.map((like: any) => ({
      user: {
        id: like.user.id,
        username: like.user.nickname || like.user.username,
        gender: like.user.gender,
        birth_date: like.user.birth_date,
        photo: like.user.photos?.[0]?.url || like.user.avatar_url || null
      },
      matched_at: like.created_at
    }));

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
                attributes: ['id', 'username', 'gender', 'birth_date'],
                include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
            }]
        });

        // Format data
        const data = likes.map((like: any) => ({
            id: like.id,
            user: {
                id: like.target_user.id,
                username: like.target_user.username,
                gender: like.target_user.gender,
                birth_date: like.target_user.birth_date,
                photo: like.target_user.photos && like.target_user.photos.length > 0 ? like.target_user.photos[0].url : null
            },
            created_at: like.created_at
        }));

        return res.status(200).json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
