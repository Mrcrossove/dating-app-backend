import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Feedback } from '../models';

const normalizeType = (raw: any) => {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'bug' || value === 'complaint') return value;
  return 'suggestion';
};

export const submitFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const type = normalizeType(req.body?.type);
    const content = String(req.body?.content || '').trim();
    const contact = String(req.body?.contact || '').trim();

    if (!content) {
      return res.status(400).json({ success: false, message: '内容不能为空' });
    }
    if (content.length > 2000) {
      return res.status(400).json({ success: false, message: '内容过长' });
    }

    const meta = {
      ua: req.get('user-agent') || '',
      ip: req.ip,
    };

    await Feedback.create({
      user_id: userId,
      type,
      content,
      contact: contact || null,
      meta: JSON.stringify(meta),
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

