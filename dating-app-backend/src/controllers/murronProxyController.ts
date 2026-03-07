import { Response } from 'express';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth';

const ADMIN_BACKEND_URL = process.env.ADMIN_BACKEND_URL || 'http://localhost:3010';

// 获取用户审核状态
export const getReviewStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || '1';
    const response = await axios.get(`${ADMIN_BACKEND_URL}/api/internal/verification/user/${userId}/status`);
    return res.json(response.data);
  } catch (error: any) {
    console.error('[MurronProxy] Review status error:', error.message);
    return res.status(500).json({ success: false, message: '审核服务暂不可用' });
  }
};

// 个人命理解读（代理到 admin-backend -> Murron API）
export const getPersonalAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || '1';
    const response = await axios.post(`${ADMIN_BACKEND_URL}/api/internal/murron/personal`, {
      user_id: userId
    }, { timeout: 130000 });

    return res.json(response.data);
  } catch (error: any) {
    const msg = error.response?.data?.message || '命理分析服务暂时不可用';
    const status = error.response?.status || 500;
    return res.status(status).json({ success: false, message: msg });
  }
};

// 灵魂合盘（代理到 admin-backend -> Murron API）
export const getCompatibilityAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || '1';
    const { target_user_id } = req.body;

    if (!target_user_id) {
      return res.status(400).json({ success: false, message: '请指定合盘对象' });
    }

    const response = await axios.post(`${ADMIN_BACKEND_URL}/api/internal/murron/compatibility`, {
      user_id: userId,
      target_user_id
    }, { timeout: 130000 });

    return res.json(response.data);
  } catch (error: any) {
    const msg = error.response?.data?.message || '合盘分析服务暂时不可用';
    const status = error.response?.status || 500;
    return res.status(status).json({ success: false, message: msg });
  }
};
