import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Like, User, Message, Photo } from '../models';

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
