import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth';
import { AuthRecord, Verification, User } from '../models';
import { parseBirthDateInput } from '../utils/birthDate';

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

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

export const getAuthStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    const [verification, records] = await Promise.all([
      Verification.findOne({ where: { user_id: userId } }),
      AuthRecord.findAll({ where: { user_id: userId } }),
    ]);

    const byType = new Map<string, any>();
    records.forEach((r: any) => byType.set(r.type, r));

    const realNameApproved = (verification && verification.status === 'approved') || (byType.get('real_name')?.status === 'approved');
    const companyApproved = byType.get('company')?.status === 'approved';
    const educationApproved = byType.get('education')?.status === 'approved';

    return res.status(200).json({
      success: true,
      data: {
        realName: !!realNameApproved,
        company: !!companyApproved,
        education: !!educationApproved,
        detail: {
          real_name: byType.get('real_name')?.status || (verification ? verification.status : 'none'),
          company: byType.get('company')?.status || 'none',
          education: byType.get('education')?.status || 'none',
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

    await upsertAuthRecord(userId, 'real_name', 'approved', payload);
    await User.update({ is_verified: true }, { where: { id: userId } });
    if (birth_date) {
      const parsedBirthDate = parseBirthDateInput(birth_date);
      if (parsedBirthDate) {
        await User.update({ birth_date: parsedBirthDate }, { where: { id: userId } }).catch(() => undefined);
      }
    }

    return res.status(200).json({ success: true, data: { status: 'approved' } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const submitCompanyAuth = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const company = String(req.body?.company || '').trim();
    const position = String(req.body?.position || '').trim();
    const email = String(req.body?.email || '').trim();
    const code = String(req.body?.code || '').trim();
    const imageUrl = String(req.body?.imageUrl || req.body?.image || '').trim();

    if (!company) return res.status(400).json({ success: false, message: '缺少公司名称' });
    if (!((email && code) || imageUrl)) return res.status(400).json({ success: false, message: '缺少认证材料' });

    const payload = { company, position, email, imageUrl };
    await upsertAuthRecord(userId, 'company', 'pending', payload);
    return res.status(200).json({ success: true, data: { status: 'pending' } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const submitEducationAuth = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const school = String(req.body?.school || '').trim();
    const degree = String(req.body?.degree || '').trim();
    const code = String(req.body?.code || '').trim();
    const imageUrl = String(req.body?.imageUrl || req.body?.image || '').trim();

    if (!school) return res.status(400).json({ success: false, message: '缺少学校' });
    if (!degree) return res.status(400).json({ success: false, message: '缺少学历' });
    if (!(code || imageUrl)) return res.status(400).json({ success: false, message: '缺少认证材料' });

    const payload = { school, degree, code: code ? 'provided' : '', imageUrl };
    await upsertAuthRecord(userId, 'education', 'pending', payload);
    return res.status(200).json({ success: true, data: { status: 'pending' } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
