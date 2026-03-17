import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Entitlement } from '../models';
import { recommendationService } from '../services/recommendationService';

const PRODUCT_KEYS = ['partner_profile', 'compatibility', 'fortune_2026', 'super_like'] as const;
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
      fortune_2026: false,
      super_like: false
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
    if (product_key === 'super_like') {
      await recommendationService.clearDiscoverCache();
    }

    return getEntitlements(req, res);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const grantEntitlements = async (req: AuthRequest, res: Response) => {
  try {
    const { target_user_id, product_keys } = req.body || {};
    const targetUserId = String(target_user_id || '').trim();
    const keys = Array.isArray(product_keys) ? product_keys.filter((x) => isProductKey(x)) : [];

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'Invalid target_user_id' });
    }
    if (keys.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid product_keys' });
    }

    await Promise.all(
      keys.map((product_key) =>
        Entitlement.findOrCreate({
          where: { user_id: targetUserId, product_key },
          defaults: { user_id: targetUserId, product_key } as any
        })
      )
    );
    if (keys.includes('super_like')) {
      await recommendationService.clearDiscoverCache();
    }

    return res.json({ success: true, data: { target_user_id: targetUserId, product_keys: keys } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
