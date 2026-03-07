import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Post, User, Photo } from '../models';

type PostMediaItem = {
  type: 'image' | 'video';
  url: string;
  size?: number;
  duration?: number;
  cover_url?: string;
};

const toNumberOrUndefined = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const parseMediaList = (raw: any): PostMediaItem[] => {
  if (!Array.isArray(raw)) return [];

  const items: PostMediaItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const type = x.type === 'video' ? 'video' : x.type === 'image' ? 'image' : null;
    const url = typeof x.url === 'string' ? x.url.trim() : '';
    if (!type || !url) continue;

    const size = toNumberOrUndefined(x.size);
    const duration = toNumberOrUndefined(x.duration);
    const cover_url = typeof x.cover_url === 'string' ? x.cover_url.trim() : undefined;

    items.push({ type, url, size, duration, cover_url });
  }
  return items;
};

export const createPost = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { content, images, media } = req.body;
    const text = typeof content === 'string' ? content.trim() : '';
    const imageList = images === undefined || images === null ? [] : images;
    const mediaList = parseMediaList(media);

    if (!Array.isArray(imageList)) {
      return res.status(400).json({ success: false, message: 'Invalid images' });
    }

    if (text.length > 2000) {
      return res.status(400).json({ success: false, message: 'Content too long' });
    }

    const sanitizedImagesFromImages = imageList
      .map((x: any) => (typeof x === 'string' ? x.trim() : ''))
      .filter((x: string) => x.length > 0);

    const sanitizedMedia =
      mediaList.length > 0
        ? mediaList
        : sanitizedImagesFromImages.map((url) => ({
            type: 'image' as const,
            url
          }));

    if (text.length === 0 && sanitizedMedia.length === 0) {
      return res.status(400).json({ success: false, message: 'Content or media required' });
    }

    if (sanitizedMedia.length > 9) {
      return res.status(400).json({ success: false, message: 'Too many media items' });
    }

    const videoCount = sanitizedMedia.filter((x) => x.type === 'video').length;
    if (videoCount > 1) {
      return res.status(400).json({ success: false, message: 'Too many videos' });
    }
    const overDuration = sanitizedMedia.some((x) => x.type === 'video' && (x.duration || 0) > 60);
    if (overDuration) {
      return res.status(400).json({ success: false, message: 'Video too long' });
    }

    const sanitizedImages = sanitizedMedia.filter((x) => x.type === 'image').map((x) => x.url);

    const post = await Post.create({
      user_id: userId,
      content: text,
      images: JSON.stringify(sanitizedImages),
      media: JSON.stringify(sanitizedMedia)
    });

    return res.status(201).json({ success: true, data: post });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getUserPosts = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;
        const posts = await Post.findAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']],
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'username'],
                include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
            }]
        });
        
        const data = posts.map((p: any) => ({
            id: p.id,
            content: p.content,
            images: JSON.parse(p.images || '[]'),
            media: (() => {
              try {
                const parsed = JSON.parse(p.media || '[]');
                if (Array.isArray(parsed)) return parsed;
              } catch (e) {
                // ignore
              }
              return (JSON.parse(p.images || '[]') || []).map((url: string) => ({ type: 'image', url }));
            })(),
            created_at: p.created_at,
            user: {
                id: p.user.id,
                username: p.user.username,
                photo: p.user.photos?.[0]?.url
            }
        }));

        return res.status(200).json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}
