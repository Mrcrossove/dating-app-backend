import { Response } from 'express';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth';
import { Entitlement } from '../models';
import { calculateBaziWithBirthData } from '../services/baziService';
import { consumeSynastryCredit, ensureReferralRewardReady, getReferralRewardBalance } from '../services/referralService';

const ADMIN_BACKEND_URL = process.env.ADMIN_BACKEND_URL || 'http://127.0.0.1:3010';
const COMPATIBILITY_TIMEOUT_MS = Number(process.env.MURRON_COMPATIBILITY_TIMEOUT_MS || 300000);

type ManualTargetInput = {
  name?: string;
  gender?: string;
  year?: number | string;
  month?: number | string;
  day?: number | string;
  hour?: number | string;
  birth_date?: string;
  birth_time?: string;
  birth_place?: string;
};

const getUnlocked = async (userId: string) => {
  const rows = await Entitlement.findAll({
    where: { user_id: userId },
    attributes: ['product_key'] as any
  });
  const set = new Set<string>(rows.map((r: any) => r.product_key));
  return {
    partner_profile: set.has('partner_profile'),
    compatibility: set.has('compatibility'),
    fortune_2026: set.has('fortune_2026'),
    dayun_report: set.has('dayun_report')
  };
};

const normalizeGender = (value: unknown) => (String(value || '').trim() === 'female' ? 'female' : 'male');

const parseHour = (value: unknown) => {
  const hour = Number(value);
  if (!Number.isFinite(hour)) return null;
  if (hour < 0 || hour > 23) return null;
  return Math.floor(hour);
};

const normalizeManualTarget = (input: ManualTargetInput = {}) => {
  const year = Number(input.year);
  const month = Number(input.month);
  const day = Number(input.day);
  const hour = parseHour(input.hour);
  const name = String(input.name || '').trim();
  const birthPlace = String(input.birth_place || '').trim();

  if (!name) {
    throw new Error('请填写合盘对象姓名');
  }
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error('请填写完整的出生日期');
  }
  if (hour === null) {
    throw new Error('请填写有效的出生时辰');
  }

  return {
    name,
    gender: normalizeGender(input.gender),
    year,
    month,
    day,
    hour,
    birth_place: birthPlace,
    birth_date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    birth_time: `${String(hour).padStart(2, '0')}:00`
  };
};

const buildBaziString = (
  gender: string,
  yearPillar: string,
  monthPillar: string,
  dayPillar: string,
  hourPillar: string
) => {
  const genderText = gender === 'female' ? '女嘉宾' : '男嘉宾';
  return `${genderText}：年柱：${yearPillar}。月柱：${monthPillar}。日柱：${dayPillar}。时柱：${hourPillar}。`;
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
    const filteredData: any = { ...data };

    if (!unlocked.partner_profile) {
      filteredData.partner_profile = '';
      filteredData.partnerProfile = '';
    }

    if (!unlocked.fortune_2026) {
      filteredData.fortune_2026 = '';
      filteredData.fortune2026 = '';
      if (filteredData.chapter_4_annual_fortune) {
        filteredData.chapter_4_annual_fortune = '';
      }
    }

    return res.json({
      success: true,
      data: {
        ...filteredData,
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
    const { target_user_id, manual_target } = req.body || {};

    const unlocked = await getUnlocked(userId);
    await ensureReferralRewardReady(userId).catch(() => undefined);
    const rewardBalance = unlocked.compatibility ? 0 : await getReferralRewardBalance(userId);
    let requestPayload: Record<string, unknown> = { user_id: userId };
    let rewardReferenceId = '';
    let rewardMeta: Record<string, unknown> = {};

    if (target_user_id) {
      requestPayload.target_user_id = target_user_id;
      rewardReferenceId = String(target_user_id);
      rewardMeta = { target_user_id: String(target_user_id) };
    } else if (manual_target && typeof manual_target === 'object') {
      const normalized = normalizeManualTarget(manual_target as ManualTargetInput);
      const birthDate = new Date(
        normalized.year,
        normalized.month - 1,
        normalized.day,
        normalized.hour,
        0,
        0,
        0
      );
      const targetBazi = await calculateBaziWithBirthData(`manual:${userId}`, birthDate, normalized.gender, true);

      requestPayload = {
        user_id: userId,
        manual_target_profile: normalized,
        manual_target_bazi: {
          gender: normalized.gender,
          year_pillar: targetBazi.year_pillar,
          month_pillar: targetBazi.month_pillar,
          day_pillar: targetBazi.day_pillar,
          hour_pillar: targetBazi.hour_pillar,
          bazi_text: buildBaziString(
            normalized.gender,
            targetBazi.year_pillar,
            targetBazi.month_pillar,
            targetBazi.day_pillar,
            targetBazi.hour_pillar
          )
        }
      };
      rewardReferenceId = `manual:${userId}:${normalized.name}:${normalized.birth_date}:${normalized.birth_time}`;
      rewardMeta = {
        manual_target_name: normalized.name,
        manual_target_birth_date: normalized.birth_date,
        manual_target_birth_time: normalized.birth_time
      };
    } else {
      return res.status(400).json({ success: false, message: '请指定合盘对象' });
    }

    const response = await axios.post(
      `${ADMIN_BACKEND_URL}/api/internal/murron/compatibility`,
      requestPayload,
      { timeout: COMPATIBILITY_TIMEOUT_MS }
    );

    const data = response.data?.data || {};
    const sections = data.sections || {};
    const canUseRewardCredit = !unlocked.compatibility && rewardBalance > 0;
    const rewardCredit = canUseRewardCredit
      ? await consumeSynastryCredit({
          userId,
          referenceId: rewardReferenceId,
          meta: rewardMeta
        })
      : {
          applied: false,
          balance_before: rewardBalance,
          balance_after: rewardBalance,
          ledger_id: null
        };
    const accessGrantedBy = unlocked.compatibility
      ? 'entitlement'
      : rewardCredit.applied
        ? 'reward_credit'
        : 'paywall';
    const paywallRequired = accessGrantedBy === 'paywall';

    return res.json({
      success: true,
      data: {
        ...data,
        fullText: undefined,
        sections: {
          compatibility: sections.compatibility || ''
        },
        unlocked,
        reward_credit: rewardCredit,
        access_granted_by: accessGrantedBy,
        paywall_required: paywallRequired
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
    const unlocked = await getUnlocked(userId);

    const response = await axios.post(
      `${ADMIN_BACKEND_URL}/api/internal/murron/dayun`,
      { user_id: userId },
      { timeout: 130000 }
    );

    const data = response.data?.data || {};
    const paywallRequired = !unlocked.dayun_report;
    return res.json({
      success: true,
      data: {
        dayun_payload: paywallRequired ? null : (data.dayun_payload || null),
        fullText: paywallRequired ? '' : (data.fullText || ''),
        bazi: data.bazi || '',
        current_luck_pillar: data.current_luck_pillar || '',
        gender: data.gender || '',
        cached: !!data.cached,
        unlocked,
        paywall_required: paywallRequired
      }
    });
  } catch (error: any) {
    const msg = error.response?.data?.message || '十年大运分析服务暂不可用，请稍后再试';
    const status = error.response?.status || 500;
    return res.status(status).json({ success: false, message: msg });
  }
};
