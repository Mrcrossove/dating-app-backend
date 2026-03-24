import { Op } from 'sequelize';
import { Entitlement } from '../models';

const VIP_PRODUCT_KEYS = ['partner_profile', 'compatibility', 'fortune_2026', 'dayun_report'] as const;
const SUPER_LIKE_PRODUCT_KEY = 'super_like' as const;

export const hasDiscoverVipAccess = async (userId: string): Promise<boolean> => {
  const count = await Entitlement.count({
    where: {
      user_id: userId,
      product_key: {
        [Op.in]: VIP_PRODUCT_KEYS as any
      }
    }
  });

  return count > 0;
};

export const getVipProductKeys = () => [...VIP_PRODUCT_KEYS];

export const hasSuperLikeAccess = async (userId: string): Promise<boolean> => {
  const count = await Entitlement.count({
    where: {
      user_id: userId,
      product_key: SUPER_LIKE_PRODUCT_KEY
    }
  });

  return count > 0;
};

export const getSuperLikeBoostUserIds = async (userIds: string[]): Promise<Set<string>> => {
  const ids = Array.from(new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return new Set<string>();

  const rows = await Entitlement.findAll({
    where: {
      user_id: { [Op.in]: ids },
      product_key: SUPER_LIKE_PRODUCT_KEY
    },
    attributes: ['user_id'] as any
  });

  return new Set(rows.map((row: any) => String(row.user_id)));
};
