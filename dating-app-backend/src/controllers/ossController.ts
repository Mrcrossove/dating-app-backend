import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createOssPostPolicy, createPrivateObjectSignedUrl } from '../services/ossService';

const pad2 = (n: number) => String(n).padStart(2, '0');

const buildDatePrefix = () => {
  const d = new Date();
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/`;
};

const normalizeCategory = (raw: unknown) => {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return 'misc';
  if (!/^[a-z0-9_-]{1,32}$/.test(value)) return 'misc';
  return value;
};

const normalizeMedia = (raw: unknown) => {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'video') return 'video';
  return 'image';
};

const normalizeAuthType = (raw: unknown) => {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'education') return 'education';
  if (value === 'real-name' || value === 'real_name') return 'real-name';
  return 'company';
};

export const getUploadPolicy = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const category = normalizeCategory(req.query.category ?? req.body?.category);
    const media = normalizeMedia(req.query.media ?? req.body?.media);

    const maxBytes = media === 'video' ? 200 * 1024 * 1024 : 30 * 1024 * 1024;
    const dir = `users/${userId}/${category}/${buildDatePrefix()}`;
    const contentTypeStartsWith = media === 'video' ? 'video/' : 'image/';

    const data = createOssPostPolicy({
      dir,
      maxBytes,
      expireSeconds: 300,
      contentTypeStartsWith
    });

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getPrivateUploadPolicy = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const type = normalizeAuthType(req.query.type ?? req.body?.type);
    const dir = `auth/${type}/${userId}/${buildDatePrefix()}`;

    const data = createOssPostPolicy({
      dir,
      maxBytes: 15 * 1024 * 1024,
      expireSeconds: 300,
      contentTypeStartsWith: 'image/',
      bucketEnvKey: 'OSS_PRIVATE_BUCKET'
    });

    return res.status(200).json({
      success: true,
      data: {
        ...data,
        isPrivate: true,
        type
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getPrivateObjectUrl = async (req: AuthRequest, res: Response) => {
  try {
    const internalToken = String(req.get('x-internal-token') || '').trim();
    const expectedToken = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
    if (!expectedToken || internalToken !== expectedToken) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const bucket = String(req.query.bucket || '').trim();
    const key = String(req.query.key || '').trim();
    if (!key) {
      return res.status(400).json({ success: false, message: 'Missing key' });
    }
    if (!key.startsWith('auth/')) {
      return res.status(400).json({ success: false, message: 'Invalid key' });
    }

    const url = createPrivateObjectSignedUrl({
      bucket: bucket || undefined,
      key,
      expiresSeconds: 300
    });
    return res.status(200).json({ success: true, data: { url, expiresIn: 300 } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

