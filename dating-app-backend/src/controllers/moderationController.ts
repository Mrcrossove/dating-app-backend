import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Block, Post, PostComment, Report, User } from '../models';

const normalizeAction = (value: unknown) => {
  const action = String(value || '').trim().toLowerCase();
  if (action === 'hide_post' || action === 'hide_comment' || action === 'block_user' || action === 'deactivate_user') {
    return action;
  }
  return 'reject';
};

export const getReports = async (req: AuthRequest, res: Response) => {
  try {
    const status = String(req.query.status || 'pending').trim();
    const where = status ? { status } : undefined;
    const rows = await Report.findAll({
      where: where as any,
      order: [['created_at', 'DESC']],
      limit: Math.min(Number(req.query.limit || 100), 200)
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const reviewReport = async (req: AuthRequest, res: Response) => {
  try {
    const reportId = String(req.params.id || '').trim();
    const report = await Report.findByPk(reportId);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const decision = String(req.body?.decision || '').trim().toLowerCase() === 'approve' ? 'approved' : 'rejected';
    const action = normalizeAction(req.body?.action);
    const reviewNote = String(req.body?.review_note || req.body?.reviewNote || '').trim();
    const targetType = String((report as any).target_type || 'user');
    const targetId = String((report as any).target_id || '').trim();

    if (decision === 'approved') {
      if (targetType === 'post' && targetId && action === 'hide_post') {
        await Post.update({
          moderation_status: 'hidden',
          hidden_reason: reviewNote || String((report as any).reason || 'reported'),
          hidden_at: new Date()
        } as any, { where: { id: targetId } });
      }

      if (targetType === 'comment' && targetId && action === 'hide_comment') {
        await PostComment.update({
          moderation_status: 'hidden',
          hidden_reason: reviewNote || String((report as any).reason || 'reported'),
          hidden_at: new Date()
        } as any, { where: { id: targetId } });
      }

      if (targetType === 'user' && targetId && action === 'deactivate_user') {
        await User.update({ is_active: false }, { where: { id: targetId } });
      }

      if (targetType === 'user' && targetId && action === 'block_user') {
        await Block.findOrCreate({
          where: { user_id: String((report as any).user_id), target_id: targetId },
          defaults: { user_id: String((report as any).user_id), target_id: targetId }
        });
      }
    }

    await report.update({
      status: decision,
      review_note: reviewNote || null,
      action_taken: decision === 'approved' ? action : 'reject',
      reviewed_by: String(req.user.id || ''),
      reviewed_at: new Date()
    } as any);

    return res.status(200).json({ success: true, data: report });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
