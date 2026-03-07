import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User, Message, Verification, Photo, Post } from '../models';
import { Op } from 'sequelize';

// --- Verification Controller ---

export const submitVerification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { front_image_url, back_image_url, id_type, birth_date } = req.body;

    if (!front_image_url || !id_type) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Update birth date if provided (for precise correction)
    if (birth_date) {
        await User.update({ birth_date: new Date(birth_date) }, { where: { id: userId } });
    }

    // Check if verification already exists
    let verification = await Verification.findOne({ where: { user_id: userId } });

    if (verification) {
      verification.front_image_url = front_image_url;
      verification.back_image_url = back_image_url || '';
      verification.id_type = id_type;
      verification.status = 'pending'; // Reset status to pending
      await verification.save();
    } else {
      verification = await Verification.create({
        user_id: userId,
        front_image_url,
        back_image_url: back_image_url || '',
        id_type,
        status: 'pending'
      });
    }

    return res.status(200).json({ success: true, message: 'Verification submitted', data: verification });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getVerificationStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const verification = await Verification.findOne({ where: { user_id: userId } });
        return res.status(200).json({ success: true, data: verification });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

// --- Photo Controller ---

export const uploadPhoto = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { url, is_primary } = req.body;

        if (!url) {
            return res.status(400).json({ success: false, message: 'Missing photo URL' });
        }

        // If setting as primary, unset others
        if (is_primary) {
            await Photo.update({ is_primary: false }, { where: { user_id: userId } });
        }

        const photo = await Photo.create({
            user_id: userId,
            url,
            is_primary: is_primary || false
        });

        return res.status(200).json({ success: true, data: photo });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const replacePhotos = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { urls } = req.body;

    if (!Array.isArray(urls)) {
      return res.status(400).json({ success: false, message: 'Invalid urls' });
    }

    const cleaned = urls
      .map((x: any) => (typeof x === 'string' ? x.trim() : ''))
      .filter((x: string) => x.length > 0)
      .slice(0, 6);

    if (cleaned.length === 0) {
      return res.status(400).json({ success: false, message: 'No photo urls provided' });
    }

    await Photo.destroy({ where: { user_id: userId } });

    const created = await Promise.all(
      cleaned.map((url: string, index: number) =>
        Photo.create({
          user_id: userId,
          url,
          is_primary: index === 0
        })
      )
    );

    return res.status(200).json({ success: true, data: created });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- Message Controller ---

export const getConversations = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        
        // Find all unique users communicated with
        // This is a simplified approach. Ideally, use a Conversations table.
        // Or distinct query on Messages
        
        // Find users where I am sender
        const sentTo = await Message.findAll({
            where: { sender_id: userId },
            attributes: ['receiver_id'],
            group: ['receiver_id']
        });
        
        // Find users where I am receiver
        const receivedFrom = await Message.findAll({
            where: { receiver_id: userId },
            attributes: ['sender_id'],
            group: ['sender_id']
        });

        const contactIds = new Set([
            ...sentTo.map((m: any) => m.receiver_id),
            ...receivedFrom.map((m: any) => m.sender_id)
        ]);

        const users = await User.findAll({
            where: { id: { [Op.in]: Array.from(contactIds) } },
            include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
        });

        // Map to conversation format
        const conversations = await Promise.all(users.map(async (u: any) => {
            const lastMessage = await Message.findOne({
                where: {
                    [Op.or]: [
                        { sender_id: userId, receiver_id: u.id },
                        { sender_id: u.id, receiver_id: userId }
                    ]
                },
                order: [['created_at', 'DESC']]
            });

            return {
                user: {
                    id: u.id,
                    username: u.username,
                    photo: u.photos && u.photos.length > 0 ? u.photos[0].url : null
                },
                last_message: lastMessage
            };
        }));

        return res.status(200).json({ success: true, data: conversations });

    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const getMessages = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { targetId } = req.params;

        const messages = await Message.findAll({
            where: {
                [Op.or]: [
                    { sender_id: userId, receiver_id: targetId },
                    { sender_id: targetId, receiver_id: userId }
                ]
            },
            order: [['created_at', 'ASC']]
        });

        return res.status(200).json({ success: true, data: messages });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const sendMessage = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { targetId } = req.params;
        const { content, type } = req.body;

        const message = await Message.create({
            sender_id: userId,
            receiver_id: targetId,
            content,
            message_type: type || 'text',
            is_read: false
        });

        return res.status(200).json({ success: true, data: message });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

// --- Profile Controller ---

export const getProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password_hash', 'provider_id', 'email'] as any },
            include: [{ model: Photo, as: 'photos' }]
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Add calculated age or other virtual fields if needed
        return res.status(200).json({ success: true, data: user });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const getPublicProfile = async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = (req.params as any).userId as string | string[] | undefined;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing userId' });
    }

    const user = await User.findByPk(userId, {
      attributes: [
        'id',
        'username',
        'nickname',
        'gender',
        'birth_date',
        'is_verified',
        'mbti',
        'interests',
        'love_view',
        'job',
        'height',
        'education',
        'constellation',
        'intro',
        'school',
        'company',
        'hometown',
        'moments',
        'wishes',
        'avatar_url',
        'created_at'
      ] as any,
      include: [{ model: Photo, as: 'photos' }]
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getPhotoWall = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const photos = await Photo.findAll({
      where: { user_id: userId },
      order: [
        ['is_primary', 'DESC'],
        ['created_at', 'DESC']
      ]
    });

    const posts = await Post.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      attributes: ['id', 'media', 'images', 'created_at'] as any
    });

    const items: Array<{ url: string; source: 'photo' | 'moment'; created_at: any }> = [];
    const seen = new Set<string>();

    const pushUrl = (url: string, source: 'photo' | 'moment', created_at: any) => {
      const key = String(url || '').trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      items.push({ url: key, source, created_at });
    };

    photos.forEach((p: any) => pushUrl(p.url, 'photo', p.created_at));

    for (const post of posts as any[]) {
      let media: any[] = [];
      try {
        const parsed = JSON.parse(post.media || '[]');
        if (Array.isArray(parsed)) media = parsed;
      } catch (e) {
        media = [];
      }

      if (media.length) {
        media
          .filter((m) => m && m.type === 'image' && typeof m.url === 'string')
          .forEach((m) => pushUrl(m.url, 'moment', post.created_at));
        continue;
      }

      try {
        const imgs = JSON.parse(post.images || '[]');
        if (Array.isArray(imgs)) imgs.forEach((u: any) => pushUrl(u, 'moment', post.created_at));
      } catch (e) {
        // ignore
      }
    }

    return res.status(200).json({ success: true, data: { items } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 允许用户更新的字段白名单
const ALLOWED_PROFILE_FIELDS = [
  'mbti', 'interests', 'love_view', 'job', 'height', 'education',
  'constellation', 'intro', 'username', 'school', 'company', 'hometown',
  'gender', 'birth_date', 'moments', 'wishes', 'nickname'
] as const;

export const updateProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // 只允许更新白名单中的字段
        const updates: Record<string, any> = {};
        for (const field of ALLOWED_PROFILE_FIELDS) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        // 特殊字段校验
        if (updates.gender && !['male', 'female'].includes(updates.gender)) {
            delete updates.gender;
        }
        if (updates.birth_date) {
            const text = String(updates.birth_date || '').trim();
            if (text) {
                updates.birth_date = new Date(text);
            } else {
                delete updates.birth_date;
            }
        }

        // 执行更新
        await user.update(updates);

        return res.status(200).json({ success: true, data: user });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}
