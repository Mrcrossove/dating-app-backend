import { Op } from 'sequelize';
import { Entitlement } from '../models';

const VIP_PRODUCT_KEYS = ['partner_profile', 'compatibility', 'fortune_2026'] as const;

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
