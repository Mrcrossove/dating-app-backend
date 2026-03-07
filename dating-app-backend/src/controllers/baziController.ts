import { Request, Response } from 'express';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth';
import { calculateBazi, calculateBaziWithBirthData } from '../services/baziService';
import { generateDetailedAnalysis, generateSoulmateProfile, generateFortuneTimeline } from '../services/geminiService';
import { User, BaziInfo } from '../models';

const ADMIN_BACKEND_URL = process.env.ADMIN_BACKEND_URL || 'http://localhost:3010';

export const calculate = async (req: AuthRequest, res: Response) => {
  try {
    // Support optional authentication - use anonymous mode if no token
    let userId = '1';
    let user = null;
    
    if (req.user && req.user.id) {
      userId = req.user.id;
      user = await User.findByPk(userId);
    }

    // Parse and validate input parameters
    const year = parseInt(req.body.year);
    const month = parseInt(req.body.month);
    const day = parseInt(req.body.day);
    let hour = req.body.hour !== undefined ? parseInt(req.body.hour) : 12;
    const gender = req.body.gender || 'male';
    
    console.log('[Bazi Controller] Received request:', { year, month, day, hour, gender, userId });
    
    // Validate date有效性
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return res.status(400).json({ success: false, message: 'Please provide valid birth date' });
    }
    
    // Ensure hour is in valid range (0-23), default to 12:00
    if (isNaN(hour) || hour < 0 || hour > 23) {
      hour = 12;
    }
    
    let birthDate: Date;
    let hourKnown = true; // Always calculate hour pillar
    
    // Use birth date from frontend
    birthDate = new Date(year, month - 1, day);
    birthDate.setHours(hour, 0, 0, 0);
    
    console.log('[Bazi Controller] Parsed date:', birthDate.toISOString());
    console.log('[Bazi Controller] Calc params:', { 
      birthDate: birthDate.toISOString(), 
      hourKnown, 
      gender 
    });
    
    // Calculate Bazi (with hour pillar support) — 不改动原有计算逻辑
    const baziInfo = await calculateBaziWithBirthData(userId, birthDate, gender, hourKnown);

    // 八字计算完成后，向 admin-backend 提交审核任务
    try {
      await axios.post(`${ADMIN_BACKEND_URL}/api/internal/verification/submit`, {
        user_id: userId,
        nickname: user?.getDataValue('username') || '',
        type: 'bazi_review',
        bazi_year_pillar: baziInfo.year_pillar,
        bazi_month_pillar: baziInfo.month_pillar,
        bazi_day_pillar: baziInfo.day_pillar,
        bazi_hour_pillar: baziInfo.hour_pillar,
        gender,
        birth_date: `${year}-${month}-${day} ${hour}:00`,
        submitted_data: { year, month, day, hour, gender }
      });
      console.log('[Bazi Controller] Verification task submitted to admin-backend');
    } catch (adminErr: any) {
      console.warn('[Bazi Controller] Failed to submit to admin-backend:', adminErr.message);
    }

    return res.status(200).json({ success: true, data: baziInfo });
  } catch (error: any) {
    console.error('[Bazi Controller] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 付费解锁详细命理解读
export const getDetailedAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const { yearPillar, monthPillar, dayPillar, hourPillar, dayElement, dayYinYang, fiveElements, xiyongshen } = req.body;
    
    console.log('[Bazi Controller] Generating detailed analysis...');
    
    // 调用Gemini API生成详细解读
    const analysis = await generateDetailedAnalysis({
      yearPillar,
      monthPillar,
      dayPillar,
      hourPillar,
      dayElement,
      dayYinYang,
      fiveElements,
      xiyongshen
    });
    
    return res.status(200).json({ 
      success: true, 
      data: { 
        analysis,
        unlocked: true 
      } 
    });
  } catch (error: any) {
    console.error('[Bazi Controller] Detailed Analysis Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getReport = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const baziInfo = await BaziInfo.findOne({ where: { user_id: userId } });

        if (!baziInfo) {
            return res.status(404).json({ success: false, message: 'Bazi info not found' });
        }

        return res.status(200).json({ success: true, data: baziInfo });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

// 付费解锁真爱画像
export const getSoulmateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { yearPillar, monthPillar, dayPillar, hourPillar, dayElement, dayYinYang, fiveElements, xiyongshen, gender } = req.body;
    
    console.log('[Bazi Controller] Generating soulmate profile...');
    
    // 调用命理大师API生成真爱画像
    const soulmateProfile = await generateSoulmateProfile({
      yearPillar,
      monthPillar,
      dayPillar,
      hourPillar,
      dayElement,
      dayYinYang,
      fiveElements,
      xiyongshen,
      gender: gender || 'male'
    });
    
    return res.status(200).json({ 
      success: true, 
      data: { 
        soulmateProfile,
        unlocked: true 
      } 
    });
  } catch (error: any) {
    console.error('[Bazi Controller] Soulmate Profile Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 付费解锁运势时间轴
export const getFortuneTimeline = async (req: AuthRequest, res: Response) => {
  try {
    const { yearPillar, monthPillar, dayPillar, hourPillar, dayElement, dayYinYang, fiveElements, xiyongshen } = req.body;
    
    console.log('[Bazi Controller] Generating fortune timeline...');
    
    // 调用命理大师API生成运势时间轴
    const timeline = await generateFortuneTimeline({
      yearPillar,
      monthPillar,
      dayPillar,
      hourPillar,
      dayElement,
      dayYinYang,
      fiveElements,
      xiyongshen
    });
    
    return res.status(200).json({ 
      success: true, 
      data: { 
        timeline,
        unlocked: true 
      } 
    });
  } catch (error: any) {
    console.error('[Bazi Controller] Fortune Timeline Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
