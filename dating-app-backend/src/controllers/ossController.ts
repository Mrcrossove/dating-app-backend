import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createOssPostPolicy } from '../services/ossService';

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

