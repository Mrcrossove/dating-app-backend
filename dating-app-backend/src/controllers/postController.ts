import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Post, User, Photo } from '../models';

export const createPost = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { content, images } = req.body; // images is array of strings
    const text = typeof content === 'string' ? content.trim() : '';
    const imageList = images === undefined || images === null ? [] : images;

    if (!Array.isArray(imageList)) {
      return res.status(400).json({ success: false, message: 'Invalid images' });
    }

    if (text.length === 0 && imageList.length === 0) {
      return res.status(400).json({ success: false, message: 'Content or images required' });
    }

    if (text.length > 2000) {
      return res.status(400).json({ success: false, message: 'Content too long' });
    }

    if (imageList.length > 9) {
      return res.status(400).json({ success: false, message: 'Too many images' });
    }

    const sanitizedImages = imageList
      .map((x: any) => (typeof x === 'string' ? x : ''))
      .filter((x: string) => x.length > 0);

    const post = await Post.create({
      user_id: userId,
      content: text,
      images: JSON.stringify(sanitizedImages)
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
