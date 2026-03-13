import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { LoginEvent, RefreshToken, User } from '../models';
import { getProfileState } from './profileService';

const JWT_SECRET = process.env.JWT_SECRET || '';
const ACCESS_TOKEN_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || '2h';
const ACCESS_EXPIRES_SECONDS = Number(process.env.ACCESS_EXPIRES_SECONDS || 7200);
const REFRESH_EXPIRES_DAYS = Number(process.env.REFRESH_EXPIRES_DAYS || 30);
const MAX_DB_VARCHAR = 255;
const MAX_CHANNEL_LENGTH = 32;
const MAX_REASON_CODE_LENGTH = 64;

const clampString = (value: unknown, maxLength: number) => {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
};

export type SessionIssueMeta = {
  ip?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
  channel?: string;
  isNewUser?: boolean;
};

export const generateAccessToken = (user: User) => {
  const expiresIn = ACCESS_TOKEN_EXPIRES as jwt.SignOptions['expiresIn'];
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn }
  );
};

const generateRefreshTokenValue = () => crypto.randomBytes(48).toString('hex');
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const revokeRefreshToken = async (refreshToken: string) => {
  const tokenHash = hashToken(refreshToken);
  await RefreshToken.update(
    { revoked_at: new Date() },
    { where: { token_hash: tokenHash, revoked_at: null } }
  );
};

export const issueSession = async (user: User, meta: SessionIssueMeta = {}) => {
  const now = new Date();
  const refreshToken = generateRefreshTokenValue();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(now.getTime() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  const safeIp = clampString(meta.ip, MAX_DB_VARCHAR);
  const safeUserAgent = clampString(meta.userAgent, MAX_DB_VARCHAR);
  const safeDeviceId = clampString(meta.deviceId, MAX_DB_VARCHAR);
  const safeChannel = clampString(meta.channel || 'unknown', MAX_CHANNEL_LENGTH) || 'unknown';

  await RefreshToken.create({
    user_id: user.id,
    token_hash: tokenHash,
    device_id: safeDeviceId,
    ip: safeIp,
    user_agent: safeUserAgent,
    expires_at: expiresAt,
    revoked_at: null,
  });

  await user.update({
    last_login_at: now,
    last_login_ip: safeIp,
    profile_completed: getProfileState(user).completed,
  });

  await LoginEvent.create({
    user_id: user.id,
    channel: safeChannel,
    ip: safeIp,
    ok: true,
    reason_code: null,
  });

  const profile = getProfileState(user);
  const accessToken = generateAccessToken(user);

  return {
    token: accessToken,
    access_token: accessToken,
    refreshToken: refreshToken,
    refresh_token: refreshToken,
    expiresIn: ACCESS_EXPIRES_SECONDS,
    expires_in: ACCESS_EXPIRES_SECONDS,
    token_type: 'Bearer',
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
    isNewUser: !!meta.isNewUser,
    is_new_user: !!meta.isNewUser,
  };
};

export const refreshSession = async (refreshToken: string, meta: SessionIssueMeta = {}) => {
  const tokenHash = hashToken(refreshToken);
  const record = await RefreshToken.findOne({ where: { token_hash: tokenHash } });

  if (!record || record.revoked_at || record.expires_at.getTime() <= Date.now()) {
    throw new Error('AUTH_REFRESH_EXPIRED');
  }

  const user = await User.findByPk(record.user_id);
  if (!user) throw new Error('AUTH_TOKEN_INVALID');

  await record.update({ revoked_at: new Date() });
  return issueSession(user, { ...meta, isNewUser: false, channel: meta.channel || 'refresh' });
};

export const recordFailedLogin = async (channel: string, reasonCode: string, meta: SessionIssueMeta = {}) => {
  await LoginEvent.create({
    user_id: null,
    channel: clampString(channel, MAX_CHANNEL_LENGTH) || 'unknown',
    ip: clampString(meta.ip, MAX_DB_VARCHAR),
    ok: false,
    reason_code: clampString(reasonCode, MAX_REASON_CODE_LENGTH),
  });
};
