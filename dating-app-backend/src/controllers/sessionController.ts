import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import axios from 'axios';
import crypto from 'crypto';
import { Op } from 'sequelize';
import { User } from '../models';
import { AuthRequest } from '../middleware/auth';
import { getProfileState } from '../services/profileService';
import { issueSession, recordFailedLogin, refreshSession, revokeRefreshToken } from '../services/sessionService';

const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';

const normalizeIp = (req: Request) => (req.headers['x-forwarded-for'] as string || req.ip || '').split(',')[0]?.trim() || null;

const exchangeWechatCode = async (code: string) => {
  const sessionRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
    params: {
      appid: WECHAT_APP_ID,
      secret: WECHAT_APP_SECRET,
      js_code: code,
      grant_type: 'authorization_code',
    },
  });

  const { openid, unionid, session_key, errcode, errmsg } = sessionRes.data || {};
  if (errcode || !openid) throw Object.assign(new Error(errmsg || 'AUTH_WECHAT_CODE_INVALID'), { code: 'AUTH_WECHAT_CODE_INVALID' });
  return { openid, unionid, session_key };
};

const decryptWechatDataInternal = (sessionKey: string, iv: string, encryptedData: string) => {
  const key = Buffer.from(sessionKey, 'base64');
  const ivBuf = Buffer.from(iv, 'base64');
  const encrypted = Buffer.from(encryptedData, 'base64');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, ivBuf);
  decipher.setAutoPadding(true);
  let decoded = decipher.update(encrypted, undefined, 'utf8');
  decoded += decipher.final('utf8');
  return JSON.parse(decoded);
};

const findOrCreateWechatUser = async (openid: string, unionid?: string) => {
  const identifier = unionid || openid;
  let user = await User.findOne({ where: { provider: 'wechat', provider_id: identifier } });
  let isNewUser = false;

  if (!user) {
    user = await User.findOne({
      where: {
        [Op.or]: [
          { wechat_unionid: unionid || '' },
          { wechat_openid: openid },
          { email: `${openid}@wechat.com` },
        ],
      },
    });
  }

  if (!user) {
    const ts = Date.now().toString(36);
    user = await User.create({
      username: `wx_${ts}`,
      nickname: '',
      email: `wx_${openid.slice(0, 16)}_${ts}@wechat.com`,
      password_hash: '',
      gender: 'female',
      birth_date: new Date('1995-01-01'),
      is_active: true,
      provider: 'wechat',
      provider_id: identifier,
      wechat_openid: openid,
      wechat_unionid: unionid || null,
      profile_completed: false,
    });
    isNewUser = true;
  } else {
    await user.update({
      provider: 'wechat',
      provider_id: identifier,
      wechat_openid: openid,
      wechat_unionid: unionid || user.wechat_unionid || null,
    });
  }

  return { user, isNewUser };
};

export const passwordRegister = async (req: Request, res: Response) => {
  try {
    const { username, password, nickname, gender } = req.body;
    if (!username || !password || password.length < 6) {
      return res.status(400).json({ success: false, code: 'AUTH_INVALID_PARAMS', message: 'Invalid register payload' });
    }

    const existing = await User.findOne({
      where: { [Op.or]: [{ username }, { email: String(username).includes('@') ? username : `${username}@local.banhe` }] },
    });
    if (existing) return res.status(409).json({ success: false, code: 'AUTH_USER_EXISTS', message: 'User already exists' });

    const user = await User.create({
      username: String(username).trim(),
      nickname: String(nickname || username).trim(),
      email: String(username).includes('@') ? String(username).trim() : `${String(username).trim()}@local.banhe`,
      password_hash: await bcrypt.hash(password, 10),
      gender: gender || 'female',
      birth_date: new Date('1995-01-01'),
      provider: 'email',
      profile_completed: false,
    });

    const data = await issueSession(user, {
      channel: 'password_register',
      isNewUser: true,
      ip: normalizeIp(req),
      userAgent: req.headers['user-agent'] || null,
    });

    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, code: 'AUTH_INTERNAL_ERROR', message: error.message });
  }
};

export const passwordLogin = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, code: 'AUTH_INVALID_PARAMS', message: 'Missing username or password' });
    }

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { username: String(username).trim() },
          { email: String(username).trim() },
        ],
      },
    });

    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      await recordFailedLogin('password_login', 'AUTH_INVALID_CREDENTIALS', { ip: normalizeIp(req), userAgent: req.headers['user-agent'] || null });
      return res.status(401).json({ success: false, code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    const data = await issueSession(user, {
      channel: 'password_login',
      isNewUser: false,
      ip: normalizeIp(req),
      userAgent: req.headers['user-agent'] || null,
    });
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, code: 'AUTH_INTERNAL_ERROR', message: error.message });
  }
};

export const wechatSessionLogin = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, code: 'AUTH_INVALID_PARAMS', message: 'Missing code' });

    const { openid, unionid } = await exchangeWechatCode(String(code));
    const { user, isNewUser } = await findOrCreateWechatUser(openid, unionid);

    const data = await issueSession(user, {
      channel: 'wechat',
      isNewUser,
      ip: normalizeIp(req),
      userAgent: req.headers['user-agent'] || null,
    });
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const code = error?.code || 'AUTH_WECHAT_CODE_INVALID';
    return res.status(400).json({ success: false, code, message: error.message || 'Wechat login failed' });
  }
};

export const refresh = async (req: Request, res: Response) => {
  try {
    const refreshToken = String(req.body?.refresh_token || '');
    if (!refreshToken) return res.status(400).json({ success: false, code: 'AUTH_INVALID_PARAMS', message: 'Missing refresh_token' });

    const data = await refreshSession(refreshToken, {
      channel: 'refresh',
      ip: normalizeIp(req),
      userAgent: req.headers['user-agent'] || null,
    });
    return res.status(200).json({ success: true, data });
  } catch {
    return res.status(401).json({ success: false, code: 'AUTH_REFRESH_EXPIRED', message: 'Refresh token expired or invalid' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const refreshToken = String(req.body?.refresh_token || '');
    if (refreshToken) await revokeRefreshToken(refreshToken);
    return res.status(200).json({ success: true, message: 'ok' });
  } catch (error: any) {
    return res.status(500).json({ success: false, code: 'AUTH_INTERNAL_ERROR', message: error.message });
  }
};

export const me = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized' });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, code: 'AUTH_TOKEN_INVALID', message: 'User not found' });

    const profile = getProfileState(user);
    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          gender: user.gender,
          avatar_url: user.avatar_url,
          phone: user.phone || null,
        },
        profile,
        bind_status: {
          wechat_bound: !!(user.provider === 'wechat' || user.wechat_openid || user.wechat_unionid),
          phone_bound: !!user.phone,
          password_set: !!user.password_hash,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, code: 'AUTH_INTERNAL_ERROR', message: error.message });
  }
};

export const bindPhone = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized' });
    const { code, iv, encryptedData } = req.body;
    if (!code || !iv || !encryptedData) {
      return res.status(400).json({ success: false, code: 'AUTH_INVALID_PARAMS', message: 'Missing code/iv/encryptedData' });
    }

    const { session_key } = await exchangeWechatCode(String(code));
    const decrypted = decryptWechatDataInternal(session_key, String(iv), String(encryptedData));
    const phoneNumber = decrypted?.phoneNumber || decrypted?.purePhoneNumber;
    if (!phoneNumber) return res.status(400).json({ success: false, code: 'AUTH_WECHAT_PHONE_INVALID', message: 'No phone number found' });

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, code: 'AUTH_TOKEN_INVALID', message: 'User not found' });

    await user.update({ phone: phoneNumber, phone_verified_at: new Date() });
    const masked = phoneNumber.length >= 7 ? `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-4)}` : phoneNumber;
    return res.status(200).json({ success: true, data: { phone_bound: true, phone_masked: masked } });
  } catch (error: any) {
    return res.status(400).json({ success: false, code: 'AUTH_WECHAT_PHONE_INVALID', message: error.message || 'Bind phone failed' });
  }
};

