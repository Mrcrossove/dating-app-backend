import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models';
import { buildImUserId, getUserToken } from '../services/easemobService';

export const getEasemobToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const imUserId = String((user as any).im_user_id || '').trim() || buildImUserId(user.id);

    if (!(user as any).im_user_id) {
      await user.update({ im_user_id: imUserId } as any);
    }

    const tokenData = await getUserToken(imUserId);

    return res.json({
      success: true,
      data: {
        imUserId: tokenData.imUserId,
        imToken: tokenData.imToken,
        expiresIn: tokenData.expiresIn
      }
    });
  } catch (error: any) {
    const status = Number(error?.response?.status || 500);
    const message =
      error?.response?.data?.error_description ||
      error?.response?.data?.error ||
      error?.message ||
      'Failed to get EaseMob token';

    console.error('[IM] getEasemobToken failed:', {
      status,
      message,
      data: error?.response?.data
    });

    return res.status(status >= 400 && status < 600 ? status : 500).json({
      success: false,
      message: status === 401 || status === 403 ? '环信配置无效，请检查服务端配置' : `获取环信 token 失败: ${message}`
    });
  }
};
