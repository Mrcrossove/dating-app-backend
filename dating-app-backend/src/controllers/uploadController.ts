import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const uploadDir = path.join(process.cwd(), 'uploads');
const maxImageBytes = 7 * 1024 * 1024;

const ensureUploadDir = () => {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
};

const parseDataUrl = (dataUrl: string) => {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return { mime, b64, ext };
};

export const uploadImagesBase64 = async (req: AuthRequest, res: Response) => {
  try {
    ensureUploadDir();

    const images = req.body?.images;
    if (!Array.isArray(images)) {
      return res.status(400).json({ success: false, message: 'Invalid images' });
    }
    if (images.length === 0) {
      return res.status(400).json({ success: false, message: 'No images provided' });
    }
    if (images.length > 9) {
      return res.status(400).json({ success: false, message: 'Too many images' });
    }

    const urls: string[] = [];
    for (const raw of images) {
      if (typeof raw !== 'string') continue;
      const parsed = parseDataUrl(raw);
      if (!parsed) {
        return res.status(400).json({ success: false, message: 'Only data:image/*;base64 is supported' });
      }

      const buffer = Buffer.from(parsed.b64, 'base64');
      if (!buffer.length) {
        return res.status(400).json({ success: false, message: 'Empty image' });
      }
      if (buffer.length > maxImageBytes) {
        return res.status(413).json({ success: false, message: 'Image too large' });
      }

      const filename = `${uuidv4()}.${parsed.ext}`;
      const absPath = path.join(uploadDir, filename);
      fs.writeFileSync(absPath, buffer);

      const host = req.get('host');
      const url = `${req.protocol}://${host}/uploads/${filename}`;
      urls.push(url);
    }

    return res.status(200).json({ success: true, data: { urls } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
