import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User, Message, Verification, Photo, Post, ConversationSummary } from '../models';
import { Op } from 'sequelize';
import axios from 'axios';
import { calculateBaziWithBirthData } from '../services/baziService';
import { getProfileState } from '../services/profileService';
import { recommendationService } from '../services/recommendationService';
import {
  backfillConversationSummariesForUser,
  markConversationRead,
  recordConversationMessage,
  resolveUserByTarget
} from '../services/conversationService';
import {
  formatBirthDateForDisplay,
  normalizeBirthDateText,
  parseBirthDateInput
} from '../utils/birthDate';

const ADMIN_BACKEND_URL = process.env.ADMIN_BACKEND_URL || 'http://127.0.0.1:3010';

const buildOssThumbUrl = (value: unknown, width: number, quality = 62): string => {
  const source = String(value || '').trim();
  if (!source || !/^https?:\/\//i.test(source)) return source;
  if (source.includes('x-oss-process=')) return source;

  let hostname = '';
  try {
    hostname = new URL(source).hostname.toLowerCase();
  } catch (_) {
    return source;
  }

  const isOssDomain = hostname.endsWith('aliyuncs.com') && hostname.includes('.oss-');
  if (!isOssDomain) return source;

  const separator = source.includes('?') ? '&' : '?';
  return `${source}${separator}x-oss-process=image/resize,m_fill,w_${Math.max(240, width)}/quality,Q_${Math.max(40, Math.min(quality, 90))}/format,webp`;
};

const serializeUserProfile = (user: any) => {
  const plain = user && typeof user.toJSON === 'function' ? user.toJSON() : user;
  if (!plain || typeof plain !== 'object') return plain;

  return {
    ...plain,
    birth_date: formatBirthDateForDisplay(plain.birth_date)
  };
};

const getBaziReviewStatus = async (userId: string) => {
  const res = await axios.get(`${ADMIN_BACKEND_URL}/api/internal/verification/user/${userId}/status`, {
    timeout: 10000
  });
  return res.data?.data?.bazi_review?.status as string | undefined;
};

const submitBaziReviewTask = async (params: {
  userId: string;
  nickname: string;
  gender: string;
  birthDate: Date;
  birthDateText?: string;
  baziInfo: any;
}) => {
  const { userId, nickname, gender, birthDate, birthDateText, baziInfo } = params;
  const auditBirthDate = birthDateText || formatBirthDateForDisplay(birthDate);

  await axios.post(
    `${ADMIN_BACKEND_URL}/api/internal/verification/submit`,
    {
      user_id: userId,
      nickname,
      type: 'bazi_review',
      bazi_year_pillar: baziInfo.year_pillar,
      bazi_month_pillar: baziInfo.month_pillar,
      bazi_day_pillar: baziInfo.day_pillar,
      bazi_hour_pillar: baziInfo.hour_pillar,
      gender,
      birth_date: auditBirthDate,
      submitted_data: {
        birth_date: auditBirthDate,
        gender
      }
    },
    { timeout: 15000 }
  );
};

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
        const parsedBirthDate = parseBirthDateInput(String(birth_date));
        if (!parsedBirthDate) {
          return res.status(400).json({ success: false, message: 'Invalid birth_date format' });
        }
        await User.update({ birth_date: parsedBirthDate }, { where: { id: userId } });
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

        const hadPrimaryBefore = await Photo.count({
          where: {
            user_id: userId,
            is_primary: true
          }
        });

        // If setting as primary, unset others
        if (is_primary) {
            await Photo.update({ is_primary: false }, { where: { user_id: userId } });
        }

        const shouldSetPrimary = !!is_primary || hadPrimaryBefore === 0;
        const photo = await Photo.create({
            user_id: userId,
            url,
            is_primary: shouldSetPrimary
        });

        if (shouldSetPrimary) {
          await User.update({ avatar_url: url }, { where: { id: userId } });
        }

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

    await User.update({ avatar_url: cleaned[0] || '' }, { where: { id: userId } });

    return res.status(200).json({ success: true, data: created });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- Message Controller ---

export const getConversations = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        await backfillConversationSummariesForUser(userId);
        const summaries = await ConversationSummary.findAll({
            where: { user_id: userId },
            order: [
              ['unread_count', 'DESC'],
              ['last_message_at', 'DESC']
            ],
            include: [{
              model: User,
              as: 'peer_user',
              attributes: ['id', 'username', 'nickname', 'avatar_url', 'im_user_id'],
              include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
            }]
        });

        const conversations = summaries.map((summary: any) => {
          const peer = summary.peer_user;
          return {
            conversation_id: summary.peer_im_user_id || peer?.im_user_id || peer?.id || '',
            chat_type: summary.chat_type || 'singleChat',
            user: {
              id: peer?.id || summary.peer_user_id,
              im_user_id: peer?.im_user_id || summary.peer_im_user_id || '',
              username: peer?.nickname || peer?.username || '用户',
              photo: peer?.photos?.[0]?.url || peer?.avatar_url || null
            },
            last_message: {
              content: summary.last_message_content,
              type: summary.last_message_type,
              created_at: summary.last_message_at,
              direction: summary.last_message_direction
            },
            unread: Number(summary.unread_count || 0),
            blocked: !!summary.is_blocked
          };
        });

        return res.status(200).json({ success: true, data: conversations });

    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const getMessages = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const rawTargetId = (req.params as any).targetId as string | string[] | undefined;
        const targetId = Array.isArray(rawTargetId) ? rawTargetId[0] : rawTargetId;
        const target = await resolveUserByTarget(String(targetId || ''));
        if (!target) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        const messages = await Message.findAll({
            where: {
                [Op.or]: [
                    { sender_id: userId, receiver_id: target.id },
                    { sender_id: target.id, receiver_id: userId }
                ]
            },
            order: [['created_at', 'ASC']]
        });

        await markConversationRead({
          userId,
          peerUserId: target.id
        });

        return res.status(200).json({ success: true, data: messages });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const sendMessage = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const rawTargetId = (req.params as any).targetId as string | string[] | undefined;
        const targetId = Array.isArray(rawTargetId) ? rawTargetId[0] : rawTargetId;
        const target = await resolveUserByTarget(String(targetId || ''));
        const { content, type } = req.body;
        const normalizedContent = String(content || '').trim();

        if (!target) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }
        if (!normalizedContent) {
          return res.status(400).json({ success: false, message: 'Message content is required' });
        }
        if (String(target.id) === String(userId)) {
          return res.status(400).json({ success: false, message: 'Cannot send message to yourself' });
        }

        const message = await recordConversationMessage({
            senderId: userId,
            receiverId: target.id,
            content: normalizedContent,
            messageType: type || 'text'
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
        return res.status(200).json({ success: true, data: serializeUserProfile(user) });
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

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { id: userId },
          { im_user_id: userId }
        ]
      },
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
        'profile_extras',
        'moments',
        'wishes',
        'avatar_url',
        'im_user_id',
        'created_at'
      ] as any,
      include: [{ model: Photo, as: 'photos' }]
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: serializeUserProfile(user) });
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

    const items: Array<{ url: string; thumb_url: string; source: 'photo' | 'moment'; created_at: any }> = [];
    const seen = new Set<string>();

    const pushUrl = (url: string, source: 'photo' | 'moment', created_at: any) => {
      const key = String(url || '').trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      items.push({
        url: key,
        thumb_url: buildOssThumbUrl(key, source === 'photo' ? 720 : 540),
        source,
        created_at
      });
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
  'constellation', 'intro', 'username', 'school', 'company', 'birth_place', 'hometown',
  'gender', 'birth_date', 'moments', 'wishes', 'nickname', 'profile_extras'
] as const;

export const updateProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        let auditBirthDateText = '';

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
                const parsedDate = parseBirthDateInput(text);
                if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
                  return res.status(400).json({
                    success: false,
                    message: 'Invalid birth_date format'
                  });
                }
                auditBirthDateText = normalizeBirthDateText(text);
                updates.birth_date = parsedDate;
            } else {
                delete updates.birth_date;
            }
        }

        const currentGender = String(user.getDataValue('gender') || '').trim();
        const currentBirthDateText = formatBirthDateForDisplay(user.getDataValue('birth_date'));
        const nextGender = updates.gender !== undefined ? String(updates.gender || '').trim() : currentGender;
        const nextBirthDateText = updates.birth_date
          ? formatBirthDateForDisplay(updates.birth_date)
          : currentBirthDateText;

        const isTryingToChangeBaziInputs =
          nextGender !== currentGender || nextBirthDateText !== currentBirthDateText;

        if (isTryingToChangeBaziInputs) {
          try {
            const status = await getBaziReviewStatus(userId);
            if (status === 'approved') {
              return res.status(400).json({
                success: false,
                message: '八字已审核通过，无法修改生日或性别'
              });
            }
          } catch (e: any) {
            return res.status(503).json({
              success: false,
              message: '审核服务暂不可用，请稍后再试'
            });
          }
        }

        // 执行更新
        await user.update(updates);
        const profile = getProfileState(user);
        if (user.profile_completed !== profile.completed) {
          await user.update({ profile_completed: profile.completed });
        }
        await recommendationService.clearDiscoverCache();

        // 注册完善资料时：自动计算八字并提交审核任务（只要生日和性别齐全）
        if (isTryingToChangeBaziInputs) {
          const birthDate: Date | undefined = user.getDataValue('birth_date');
          const gender: string | undefined = user.getDataValue('gender');

          if (birthDate && (gender === 'male' || gender === 'female')) {
            const baziInfo = await calculateBaziWithBirthData(userId, birthDate, gender, true);
            try {
              await submitBaziReviewTask({
                userId,
                nickname: user.getDataValue('nickname') || user.getDataValue('username') || '',
                gender,
                birthDate,
                birthDateText: auditBirthDateText,
                baziInfo
              });
            } catch (e: any) {
              // Do not fail profile update if admin-backend is down
              console.warn('[User] Failed to submit bazi review task:', e.message);
            }
          }
        }

        return res.status(200).json({ success: true, data: serializeUserProfile(user), profile });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}
