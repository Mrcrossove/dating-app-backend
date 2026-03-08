import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Op } from 'sequelize';
import { Post, User, Photo, PostLike, PostComment, PostView } from '../models';

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

const safeJsonArray = (text: any) => {
  try {
    const parsed = JSON.parse(String(text || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const normalizePagination = (req: AuthRequest) => {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSizeRaw = parseInt(String(req.query.pageSize || req.query.page_size || '20'), 10) || 20;
  const pageSize = Math.max(1, Math.min(50, pageSizeRaw));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
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
      media: JSON.stringify(sanitizedMedia),
      likes_count: 0,
      views_count: 0,
      comments_count: 0
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
                attributes: ['id', 'username', 'nickname', 'avatar_url'],
                include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
            }]
        });
        
        const data = posts.map((p: any) => ({
            id: p.id,
            content: p.content,
            images: safeJsonArray(p.images),
            media: (() => {
              const parsed = safeJsonArray(p.media);
              if (parsed.length) return parsed;
              return safeJsonArray(p.images).map((url: string) => ({ type: 'image', url }));
            })(),
            created_at: p.created_at,
            likes_count: p.likes_count || 0,
            views_count: p.views_count || 0,
            comments_count: p.comments_count || 0,
            user: {
                id: p.user.id,
                username: p.user.nickname || p.user.username,
                photo: p.user.photos?.[0]?.url || p.user.avatar_url || null
            }
        }));

        return res.status(200).json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

export const getFeed = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { offset, pageSize, page } = normalizePagination(req);

    const posts = await Post.findAll({
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'nickname', 'avatar_url'],
        include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
      }]
    });

    const postIds = posts.map((p: any) => p.id);
    const liked = postIds.length
      ? await PostLike.findAll({ where: { user_id: userId, post_id: { [Op.in]: postIds } }, attributes: ['post_id'] })
      : [];
    const likedSet = new Set(liked.map((x: any) => String(x.post_id)));

    const data = posts.map((p: any) => ({
      id: p.id,
      content: p.content,
      images: safeJsonArray(p.images),
      media: (() => {
        const parsed = safeJsonArray(p.media);
        if (parsed.length) return parsed;
        return safeJsonArray(p.images).map((url: string) => ({ type: 'image', url }));
      })(),
      created_at: p.created_at,
      likes_count: p.likes_count || 0,
      views_count: p.views_count || 0,
      comments_count: p.comments_count || 0,
      is_liked: likedSet.has(String(p.id)),
      user: {
        id: p.user.id,
        username: p.user.nickname || p.user.username,
        photo: p.user.photos?.[0]?.url || p.user.avatar_url || null
      }
    }));

    return res.status(200).json({ success: true, data, pagination: { page, pageSize } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getPostDetail = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ success: false, message: 'Post id required' });

    const post = await Post.findByPk(id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'nickname', 'avatar_url'],
        include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
      }]
    });

    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const [, created] = await PostView.findOrCreate({
      where: { post_id: id, user_id: String(userId) },
      defaults: { post_id: id, user_id: String(userId) }
    });
    if (created) {
      await Post.increment('views_count', { by: 1, where: { id } }).catch(() => undefined);
    }

    const like = await PostLike.findOne({ where: { post_id: id, user_id: String(userId) } });

    const p: any = post;
    const data = {
      id: p.id,
      content: p.content,
      images: safeJsonArray(p.images),
      media: (() => {
        const parsed = safeJsonArray(p.media);
        if (parsed.length) return parsed;
        return safeJsonArray(p.images).map((url: string) => ({ type: 'image', url }));
      })(),
      created_at: p.created_at,
      likes_count: p.likes_count || 0,
      views_count: p.views_count || 0,
      comments_count: p.comments_count || 0,
      is_liked: !!like,
      user: {
        id: p.user.id,
        username: p.user.nickname || p.user.username,
        photo: p.user.photos?.[0]?.url || p.user.avatar_url || null
      }
    };

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const likePost = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ success: false, message: 'Post id required' });

    const [row, created] = await PostLike.findOrCreate({
      where: { post_id: id, user_id: String(userId) },
      defaults: { post_id: id, user_id: String(userId) }
    });

    if (created) {
      await Post.increment('likes_count', { by: 1, where: { id } }).catch(() => undefined);
    }

    return res.status(200).json({ success: true, data: { liked: true } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const unlikePost = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ success: false, message: 'Post id required' });

    const deleted = await PostLike.destroy({ where: { post_id: id, user_id: String(userId) } });
    if (deleted) {
      await Post.increment('likes_count', { by: -1, where: { id } }).catch(() => undefined);
    }

    return res.status(200).json({ success: true, data: { liked: false } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const addComment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ success: false, message: 'Post id required' });
    const content = String(req.body?.content || '').trim();

    if (!content) return res.status(400).json({ success: false, message: '内容不能为空' });
    if (content.length > 500) return res.status(400).json({ success: false, message: '内容过长' });

    const comment = await PostComment.create({ post_id: id, user_id: String(userId), content });
    await Post.increment('comments_count', { by: 1, where: { id } }).catch(() => undefined);

    return res.status(201).json({ success: true, data: comment });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getComments = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ success: false, message: 'Post id required' });
    const { offset, pageSize, page } = normalizePagination(req);

    const comments = await PostComment.findAll({
      where: { post_id: id },
      order: [['created_at', 'ASC']],
      limit: pageSize,
      offset,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'nickname', 'avatar_url'],
        include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
      }]
    });

    const data = comments.map((c: any) => ({
      id: c.id,
      content: c.content,
      created_at: c.created_at,
      user: {
        id: c.user.id,
        username: c.user.nickname || c.user.username,
        photo: c.user.photos?.[0]?.url || c.user.avatar_url || null
      }
    }));

    return res.status(200).json({ success: true, data, pagination: { page, pageSize } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
