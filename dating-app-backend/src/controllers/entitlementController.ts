import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Entitlement } from '../models';

const PRODUCT_KEYS = ['partner_profile', 'compatibility', 'fortune_2026'] as const;
type ProductKey = (typeof PRODUCT_KEYS)[number];

const isProductKey = (value: any): value is ProductKey =>
  typeof value === 'string' && (PRODUCT_KEYS as readonly string[]).includes(value);

export const getEntitlements = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const rows = await Entitlement.findAll({
      where: { user_id: userId },
      attributes: ['product_key', 'created_at'] as any,
      order: [['created_at', 'DESC']]
    });

    const unlocked: Record<ProductKey, boolean> = {
      partner_profile: false,
      compatibility: false,
      fortune_2026: false
    };
    rows.forEach((r: any) => {
      const key = r.product_key as ProductKey;
      if (isProductKey(key)) unlocked[key] = true;
    });

    return res.json({ success: true, data: { unlocked, items: rows } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const unlockEntitlement = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { product_key } = req.body || {};
    if (!isProductKey(product_key)) {
      return res.status(400).json({ success: false, message: 'Invalid product_key' });
    }

    await Entitlement.findOrCreate({
      where: { user_id: userId, product_key },
      defaults: { user_id: userId, product_key } as any
    });

    return getEntitlements(req, res);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

