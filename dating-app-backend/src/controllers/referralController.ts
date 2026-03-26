import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getReferralDashboard } from '../services/referralService';

export const getReferralSummary = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const data = await getReferralDashboard(userId);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
