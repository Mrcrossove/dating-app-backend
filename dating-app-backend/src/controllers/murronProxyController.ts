import { Response } from 'express';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth';
import { Entitlement } from '../models';

const ADMIN_BACKEND_URL = process.env.ADMIN_BACKEND_URL || 'http://127.0.0.1:3010';

const getUnlocked = async (userId: string) => {
  const rows = await Entitlement.findAll({
    where: { user_id: userId },
    attributes: ['product_key'] as any
  });
  const set = new Set<string>(rows.map((r: any) => r.product_key));
  return {
    partner_profile: set.has('partner_profile'),
    compatibility: set.has('compatibility'),
    fortune_2026: set.has('fortune_2026')
  };
};

export const getReviewStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const response = await axios.get(
      `${ADMIN_BACKEND_URL}/api/internal/verification/user/${userId}/status`,
      { timeout: 10000 }
    );
    return res.json(response.data);
  } catch (error: any) {
    console.error('[MurronProxy] Review status error:', error.message);
    return res.status(500).json({ success: false, message: '审核服务暂不可用' });
  }
};

export const getPersonalAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const response = await axios.post(
      `${ADMIN_BACKEND_URL}/api/internal/murron/personal`,
      { user_id: userId },
      { timeout: 130000 }
    );

    const unlocked = await getUnlocked(userId);
    const data = response.data?.data || {};
    const sections = data.sections || {};

    const filteredSections: any = {
      basicInfo: sections.basicInfo || '',
      characterAnalysis: sections.characterAnalysis || ''
    };

    if (unlocked.partner_profile) filteredSections.partnerProfile = sections.partnerProfile || '';
    if (unlocked.fortune_2026) filteredSections.fortune2026 = sections.fortune2026 || '';

    return res.json({
      success: true,
      data: {
        ...data,
        fullText: undefined,
        sections: filteredSections,
        unlocked,
        locked: {
          partner_profile: !unlocked.partner_profile,
          fortune_2026: !unlocked.fortune_2026
        }
      }
    });
  } catch (error: any) {
    const msg = error.response?.data?.message || '命理分析服务暂不可用，请稍后再试';
    const status = error.response?.status || 500;
    return res.status(status).json({ success: false, message: msg });
  }
};

export const getCompatibilityAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { target_user_id } = req.body || {};

    if (!target_user_id) {
      return res.status(400).json({ success: false, message: '请指定合盘对象' });
    }

    const unlocked = await getUnlocked(userId);
    if (!unlocked.compatibility) {
      return res.status(402).json({ success: false, message: '需要解锁灵魂合盘报告' });
    }

    const response = await axios.post(
      `${ADMIN_BACKEND_URL}/api/internal/murron/compatibility`,
      { user_id: userId, target_user_id },
      { timeout: 130000 }
    );

    const data = response.data?.data || {};
    const sections = data.sections || {};

    return res.json({
      success: true,
      data: {
        ...data,
        fullText: undefined,
        sections: {
          compatibility: sections.compatibility || ''
        },
        unlocked
      }
    });
  } catch (error: any) {
    const msg = error.response?.data?.message || '合盘分析服务暂不可用，请稍后再试';
    const status = error.response?.status || 500;
    return res.status(status).json({ success: false, message: msg });
  }
};

export const getDayunAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    const response = await axios.post(
      `${ADMIN_BACKEND_URL}/api/internal/murron/dayun`,
      { user_id: userId },
      { timeout: 130000 }
    );

    const data = response.data?.data || {};
    return res.json({
      success: true,
      data: {
        fullText: data.fullText || '',
        bazi: data.bazi || '',
        current_luck_pillar: data.current_luck_pillar || '',
        gender: data.gender || '',
        cached: !!data.cached
      }
    });
  } catch (error: any) {
    const msg = error.response?.data?.message || '十年大运分析服务暂不可用，请稍后再试';
    const status = error.response?.status || 500;
    return res.status(status).json({ success: false, message: msg });
  }
};
