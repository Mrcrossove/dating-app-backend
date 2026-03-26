import { Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth';
import { AuthRecord, Verification, User } from '../models';
import { parseBirthDateInput } from '../utils/birthDate';
import { ensureReferralCode, finalizeReferralVerification } from '../services/referralService';

const ADMIN_BACKEND_URL = process.env.ADMIN_BACKEND_URL || 'http://127.0.0.1:3010';

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

const normalizeAuthImage = (raw: any) => {
  if (!raw || typeof raw !== 'object') return null;

  const bucket = String(raw.bucket || '').trim();
  const key = String(raw.key || '').trim().replace(/^\/+/, '');
  const mimeType = String(raw.mimeType || raw.contentType || '').trim().toLowerCase();
  const size = Number(raw.size || 0);
  const filename = String(raw.filename || '').trim();

  if (!bucket || !key) return null;
  if (!key.startsWith('auth/')) return null;
  if (mimeType && !mimeType.startsWith('image/')) return null;
  if (size && (!Number.isFinite(size) || size <= 0 || size > 15 * 1024 * 1024)) return null;

  return {
    bucket,
    key,
    mimeType: mimeType || 'image/jpeg',
    size: size > 0 ? size : 0,
    filename
  };
};

const upsertAuthRecord = async (userId: string, type: 'real_name' | 'company' | 'education', status: 'pending' | 'approved' | 'rejected', payload: any) => {
  const existing = await AuthRecord.findOne({ where: { user_id: userId, type } });
  if (existing) {
    await existing.update({
      status,
      payload: JSON.stringify(payload || {}),
      reviewed_at: status === 'approved' || status === 'rejected' ? new Date() : null,
    });
    return existing;
  }

  return AuthRecord.create({
    user_id: userId,
    type,
    status,
    payload: JSON.stringify(payload || {}),
    reviewed_at: status === 'approved' || status === 'rejected' ? new Date() : null,
  });
};

const submitAdminVerificationTask = async (params: {
  userId: string;
  nickname: string;
  type: 'real_name' | 'company' | 'education';
  submittedData: Record<string, any>;
}) => {
  const { userId, nickname, type, submittedData } = params;
  await axios.post(
    `${ADMIN_BACKEND_URL}/api/internal/verification/submit`,
    {
      user_id: userId,
      nickname,
      type,
      submitted_data: submittedData
    },
    { timeout: 15000 }
  );
};

export const getAuthStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    const [verification, records, user, adminStatusRes] = await Promise.all([
      Verification.findOne({ where: { user_id: userId } }),
      AuthRecord.findAll({ where: { user_id: userId } }),
      User.findByPk(userId),
      axios
        .get(`${ADMIN_BACKEND_URL}/api/internal/verification/user/${userId}/status`, { timeout: 10000 })
        .catch(() => ({ data: { data: null } }))
    ]);

    const byType = new Map<string, any>();
    records.forEach((r: any) => byType.set(r.type, r));

    const adminDetail = adminStatusRes?.data?.data || {};
    const realNameStatus = adminDetail.real_name || byType.get('real_name')?.status || (verification ? verification.status : 'none');
    const companyStatus = adminDetail.company || byType.get('company')?.status || 'none';
    const educationStatus = adminDetail.education || byType.get('education')?.status || 'none';

    await Promise.all([
      realNameStatus && realNameStatus !== 'none'
        ? upsertAuthRecord(userId, 'real_name', realNameStatus === 'approved' ? 'approved' : realNameStatus === 'rejected' ? 'rejected' : 'pending', {})
        : Promise.resolve(),
      companyStatus && companyStatus !== 'none'
        ? upsertAuthRecord(userId, 'company', companyStatus === 'approved' ? 'approved' : companyStatus === 'rejected' ? 'rejected' : 'pending', {})
        : Promise.resolve(),
      educationStatus && educationStatus !== 'none'
        ? upsertAuthRecord(userId, 'education', educationStatus === 'approved' ? 'approved' : educationStatus === 'rejected' ? 'rejected' : 'pending', {})
        : Promise.resolve()
    ]);

    if (user) {
      await ensureReferralCode(user);
    }
    if (realNameStatus === 'approved') {
      await User.update({ is_verified: true }, { where: { id: userId } }).catch(() => undefined);
      await finalizeReferralVerification(userId).catch(() => undefined);
    }

    return res.status(200).json({
      success: true,
      data: {
        realName: realNameStatus === 'approved',
        company: companyStatus === 'approved',
        education: educationStatus === 'approved',
        detail: {
          real_name: realNameStatus,
          company: companyStatus,
          education: educationStatus,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const submitRealNameAuth = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    const realName = String(req.body?.realName || '').trim();
    const idCard = String(req.body?.idCard || '').trim();
    const birth_date = String(req.body?.birth_date || '').trim();

    if (!realName) return res.status(400).json({ success: false, message: '缺少真实姓名' });
    if (!idCard || idCard.length < 8) return res.status(400).json({ success: false, message: '缺少证件号码' });

    const payload = {
      realName,
      idLast4: idCard.slice(-4),
      idHash: sha256(idCard),
    };

    await upsertAuthRecord(userId, 'real_name', 'pending', payload);
    if (birth_date) {
      const parsedBirthDate = parseBirthDateInput(birth_date);
      if (parsedBirthDate) {
        await User.update({ birth_date: parsedBirthDate }, { where: { id: userId } }).catch(() => undefined);
      }
    }

    await submitAdminVerificationTask({
      userId,
      nickname: user?.getDataValue('nickname') || user?.getDataValue('username') || '',
      type: 'real_name',
      submittedData: {
        realName,
        idLast4: idCard.slice(-4)
      }
    });

    return res.status(200).json({ success: true, data: { status: 'pending' } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const submitCompanyAuth = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    const company = String(req.body?.company || '').trim();
    const position = String(req.body?.position || '').trim();
    const email = String(req.body?.email || '').trim();
    const code = String(req.body?.code || '').trim();
    const imageUrl = String(req.body?.imageUrl || req.body?.image || '').trim();
    const authImage = normalizeAuthImage(req.body?.authImage);

    if (!company) return res.status(400).json({ success: false, message: '缺少公司名称' });
    if (!((email && code) || imageUrl || authImage)) return res.status(400).json({ success: false, message: '缺少认证材料' });

    const payload = { company, position, email, imageUrl, authImage };
    await upsertAuthRecord(userId, 'company', 'pending', payload);
    await submitAdminVerificationTask({
      userId,
      nickname: user?.getDataValue('nickname') || user?.getDataValue('username') || '',
      type: 'company',
      submittedData: payload
    });
    return res.status(200).json({ success: true, data: { status: 'pending' } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const submitEducationAuth = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    const school = String(req.body?.school || '').trim();
    const degree = String(req.body?.degree || '').trim();
    const code = String(req.body?.code || '').trim();
    const imageUrl = String(req.body?.imageUrl || req.body?.image || '').trim();
    const authImage = normalizeAuthImage(req.body?.authImage);

    if (!school) return res.status(400).json({ success: false, message: '缺少学校' });
    if (!degree) return res.status(400).json({ success: false, message: '缺少学历' });
    if (!(code || imageUrl || authImage)) return res.status(400).json({ success: false, message: '缺少认证材料' });

    const payload = { school, degree, code: code ? 'provided' : '', imageUrl, authImage };
    await upsertAuthRecord(userId, 'education', 'pending', payload);
    await submitAdminVerificationTask({
      userId,
      nickname: user?.getDataValue('nickname') || user?.getDataValue('username') || '',
      type: 'education',
      submittedData: payload
    });
    return res.status(200).json({ success: true, data: { status: 'pending' } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
