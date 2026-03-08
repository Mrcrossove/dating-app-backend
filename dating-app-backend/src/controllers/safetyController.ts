import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Block, Report, User, Photo } from '../models';

export const reportUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const target_id = String(req.body?.target_id || '').trim();
    const reason = String(req.body?.reason || '').trim();
    const detail = String(req.body?.detail || '').trim();

    if (!target_id) return res.status(400).json({ success: false, message: '缺少target_id' });
    if (!reason) return res.status(400).json({ success: false, message: '缺少reason' });

    await Report.create({ user_id: userId, target_id, reason, detail: detail || null });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const blockUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { targetId } = req.params;
    if (!targetId) return res.status(400).json({ success: false, message: '缺少targetId' });
    if (String(userId) === String(targetId)) return res.status(400).json({ success: false, message: '不能拉黑自己' });

    await Block.findOrCreate({
      where: { user_id: userId, target_id: targetId },
      defaults: { user_id: userId, target_id: targetId }
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const unblockUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { targetId } = req.params;
    if (!targetId) return res.status(400).json({ success: false, message: '缺少targetId' });

    await Block.destroy({ where: { user_id: userId, target_id: targetId } });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getBlocks = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const blocks = await Block.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      include: [{
        model: User,
        as: 'target_user',
        attributes: ['id', 'username', 'nickname', 'avatar_url'],
        include: [{ model: Photo, as: 'photos', where: { is_primary: true }, required: false }]
      }]
    });

    const data = blocks.map((b: any) => ({
      id: b.id,
      created_at: b.created_at,
      user: {
        id: b.target_user.id,
        username: b.target_user.nickname || b.target_user.username,
        photo: b.target_user.photos?.[0]?.url || b.target_user.avatar_url || null
      }
    }));

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

