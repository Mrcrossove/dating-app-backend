import crypto from 'crypto';
import { Op } from 'sequelize';
import sequelize from '../config/database';
import { ReferralCreditLedger, ReferralInvite, ReferralReward, User } from '../models';

const REWARD_QUANTITY = Math.max(1, Number(process.env.REFERRAL_REWARD_QUANTITY || 1));
const DAILY_INVITE_LIMIT = Math.max(1, Number(process.env.REFERRAL_DAILY_LIMIT || 20));

const normalizeIp = (value: unknown) => String(value || '').trim() || null;

export const generateReferralCode = (): string =>
  crypto.randomBytes(4).toString('hex').toUpperCase();

export const ensureReferralCode = async (user: User): Promise<string> => {
  const existing = String(user.getDataValue('referral_code') || '').trim();
  if (existing) return existing;

  let nextCode = '';
  for (let i = 0; i < 8; i += 1) {
    nextCode = generateReferralCode();
    const found = await User.findOne({ where: { referral_code: nextCode } });
    if (!found) break;
    nextCode = '';
  }

  if (!nextCode) {
    nextCode = `${String(user.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }

  await user.update({ referral_code: nextCode });
  return nextCode;
};

export const bindReferralForNewUser = async (params: {
  user: User;
  referralCode?: string;
  ip?: string | null;
}) => {
  const { user } = params;
  await ensureReferralCode(user);

  const referralCode = String(params.referralCode || '').trim().toUpperCase();
  if (!referralCode) return null;

  const inviteeId = String(user.id);
  const inviter = await User.findOne({ where: { referral_code: referralCode } });
  if (!inviter || String(inviter.id) === inviteeId) return null;

  const existingInvite = await ReferralInvite.findOne({ where: { invitee_id: inviteeId } });
  if (existingInvite) return existingInvite;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const inviterDailyCount = await ReferralInvite.count({
    where: {
      inviter_id: inviter.id,
      created_at: { [Op.gte]: todayStart }
    } as any
  });

  if (inviterDailyCount >= DAILY_INVITE_LIMIT) {
    return ReferralInvite.create({
      inviter_id: inviter.id,
      invitee_id: inviteeId,
      referral_code: referralCode,
      invited_ip: normalizeIp(params.ip),
      reward_status: 'blocked',
      reward_reason: 'daily_limit_reached',
      status: 'registered',
    } as any);
  }

  await user.update({ referred_by: inviter.id });
  return ReferralInvite.create({
    inviter_id: inviter.id,
    invitee_id: inviteeId,
    referral_code: referralCode,
    invited_ip: normalizeIp(params.ip),
    status: 'registered',
    reward_status: 'pending',
  } as any);
};

const incrementRewardBalance = async (
  userId: string,
  quantity: number,
  options: {
    sourceType?: string;
    sourceId?: string | null;
    note?: string | null;
    meta?: Record<string, unknown>;
  } = {}
) => {
  if (quantity <= 0) return;

  await sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) return;

    const balanceAfter = Number(user.getDataValue('referral_reward_balance') || 0) + quantity;
    const totalAfter = Number(user.getDataValue('referral_reward_total') || 0) + quantity;

    await user.update(
      {
        referral_reward_balance: balanceAfter,
        referral_reward_total: totalAfter,
      },
      { transaction }
    );

    await ReferralCreditLedger.create(
      {
        user_id: userId,
        change_amount: quantity,
        balance_after: balanceAfter,
        source_type: options.sourceType || 'reward_issue',
        source_id: options.sourceId || null,
        note: options.note || 'referral reward issued',
        meta: JSON.stringify(options.meta || {}),
      } as any,
      { transaction }
    );
  });
};

export const finalizeReferralVerification = async (inviteeId: string) => {
  const invite = await ReferralInvite.findOne({ where: { invitee_id: inviteeId } });
  if (!invite) return null;
  if (String(invite.getDataValue('reward_status')) === 'issued') return invite;

  const inviter = await User.findByPk(invite.getDataValue('inviter_id'));
  const invitee = await User.findByPk(inviteeId);
  if (!inviter || !invitee) return null;

  const inviterIp = normalizeIp(inviter.getDataValue('last_login_ip'));
  const inviteeIp = normalizeIp(invitee.getDataValue('last_login_ip'));

  if (inviterIp && inviteeIp && inviterIp === inviteeIp) {
    await invite.update({
      status: 'verified',
      verified_at: new Date(),
      reward_status: 'blocked',
      reward_reason: 'same_ip_detected',
    });
    return invite;
  }

  const alreadyIssued = await ReferralReward.count({ where: { invite_id: invite.getDataValue('id') } });
  if (alreadyIssued === 0) {
    await ReferralReward.bulkCreate([
      {
        user_id: inviter.id,
        invite_id: invite.getDataValue('id'),
        reward_type: 'synastry_credit',
        quantity: REWARD_QUANTITY,
        direction: 'inviter',
        status: 'issued',
        meta: JSON.stringify({ invitee_id: invitee.id }),
      } as any,
      {
        user_id: invitee.id,
        invite_id: invite.getDataValue('id'),
        reward_type: 'synastry_credit',
        quantity: REWARD_QUANTITY,
        direction: 'invitee',
        status: 'issued',
        meta: JSON.stringify({ inviter_id: inviter.id }),
      } as any
    ]);

    await Promise.all([
      incrementRewardBalance(inviter.id, REWARD_QUANTITY, {
        sourceType: 'referral_reward',
        sourceId: String(invite.getDataValue('id')),
        note: 'referral reward for inviter',
        meta: { invitee_id: invitee.id, direction: 'inviter' },
      }),
      incrementRewardBalance(invitee.id, REWARD_QUANTITY, {
        sourceType: 'referral_reward',
        sourceId: String(invite.getDataValue('id')),
        note: 'referral reward for invitee',
        meta: { inviter_id: inviter.id, direction: 'invitee' },
      }),
    ]);
  }

  await invite.update({
    status: 'verified',
    verified_at: new Date(),
    rewarded_at: new Date(),
    reward_status: 'issued',
    reward_reason: null,
  });

  return invite;
};

export const getReferralDashboard = async (userId: string) => {
  const user = await User.findByPk(userId);
  if (!user) throw new Error('User not found');

  const referralCode = await ensureReferralCode(user);
  const [invites, rewards] = await Promise.all([
    ReferralInvite.findAll({
      where: { inviter_id: userId },
      order: [['created_at', 'DESC']],
      include: [{ model: User, as: 'invitee', attributes: ['id', 'username', 'nickname'] as any }]
    }),
    ReferralReward.findAll({
      where: { user_id: userId, status: 'issued' },
      order: [['created_at', 'DESC']]
    })
  ]);

  const verifiedCount = invites.filter((item: any) => String(item.status) === 'verified').length;
  const pendingCount = invites.filter((item: any) => String(item.status) === 'registered').length;
  const totalRewards = rewards.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);

  return {
    referralCode,
    stats: {
      invitedCount: invites.length,
      verifiedCount,
      pendingCount,
      rewardBalance: Number(user.getDataValue('referral_reward_balance') || 0),
      rewardTotal: Number(user.getDataValue('referral_reward_total') || 0),
      rewardsEarned: totalRewards,
      nextRewardRemaining: pendingCount > 0 ? 0 : 1,
      progressPercent: pendingCount > 0 ? 70 : 0,
    },
    invites: invites.map((item: any) => ({
      id: item.id,
      invitee_id: item.invitee_id,
      nickname: item.invitee?.nickname || item.invitee?.username || '新用户',
      status: item.status,
      reward_status: item.reward_status,
      reward_reason: item.reward_reason,
      created_at: item.created_at,
      verified_at: item.verified_at,
      rewarded_at: item.rewarded_at,
    })),
    rewards: rewards.map((item: any) => ({
      id: item.id,
      reward_type: item.reward_type,
      quantity: Number(item.quantity || 0),
      direction: item.direction,
      created_at: item.created_at,
    }))
  };
};

export const getReferralRewardBalance = async (userId: string): Promise<number> => {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'referral_reward_balance'] as any,
  });
  if (!user) return 0;
  return Math.max(0, Number(user.getDataValue('referral_reward_balance') || 0));
};

export const consumeSynastryCredit = async (params: {
  userId: string;
  referenceId?: string | null;
  meta?: Record<string, unknown>;
}) => {
  return sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(params.userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) {
      throw new Error('User not found');
    }

    const balanceBefore = Math.max(0, Number(user.getDataValue('referral_reward_balance') || 0));
    if (balanceBefore <= 0) {
      return {
        applied: false,
        balance_before: balanceBefore,
        balance_after: balanceBefore,
        ledger_id: null,
      };
    }

    const balanceAfter = balanceBefore - 1;
    await user.update({ referral_reward_balance: balanceAfter }, { transaction });

    const ledger = await ReferralCreditLedger.create(
      {
        user_id: params.userId,
        change_amount: -1,
        balance_after: balanceAfter,
        source_type: 'compatibility_consume',
        source_id: params.referenceId || null,
        note: 'consume reward credit for compatibility analysis',
        meta: JSON.stringify(params.meta || {}),
      } as any,
      { transaction }
    );

    return {
      applied: true,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      ledger_id: ledger.getDataValue('id'),
    };
  });
};
