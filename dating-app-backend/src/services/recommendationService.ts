import { User, BaziInfo, Photo } from '../models';
import { calculateCompatibility } from './baziService';
import { cache } from '../config/redis';
import { Op } from 'sequelize';

const CACHE_TTL = 300; // 5分钟缓存
const MIN_COMPATIBILITY_SCORE = 70;
const DEFAULT_PAGE_SIZE = 20;
const SAMPLE_SIZE = 100; // 随机采样数量

interface RecommendationParams {
  userId: string;
  page?: number;
  limit?: number;
  excludeIds?: string[]; // 已看过/跳过的用户ID
}

interface RecommendationResult {
  user: {
    id: string;
    username: string;
    gender: string;
    birth_date: Date;
    photo: string | null;
  };
  compatibility_score: number;
}

export class RecommendationService {
  /**
   * 获取推荐用户列表（带缓存）
   */
  async getRecommendations(params: RecommendationParams): Promise<{
    data: RecommendationResult[];
    total: number;
    hasMore: boolean;
  }> {
    const { userId, page = 1, limit = DEFAULT_PAGE_SIZE, excludeIds = [] } = params;
    const cacheKey = `recommendations:${userId}:page${page}`;

    // 1. 尝试从缓存获取
    const cached = await cache.get<{ data: RecommendationResult[]; total: number }>(cacheKey);
    if (cached) {
      return {
        ...cached,
        hasMore: cached.data.length === limit,
      };
    }

    // 2. 获取当前用户信息
    const currentUser = await User.findByPk(userId, {
      include: [{ model: BaziInfo, as: 'bazi_info' }],
    });

    if (!currentUser || !currentUser.bazi_info) {
      throw new Error('Please complete your profile and bazi calculation first');
    }

    // 3. 数据库层面过滤，减少数据传输
    const targetGender = currentUser.gender === 'male' ? 'female' : 'male';
    const allExcludedIds = [...excludeIds, userId];

    const candidates = await User.findAll({
      where: {
        gender: targetGender,
        id: { [Op.notIn]: allExcludedIds },
        is_active: true,
      },
      include: [
        { model: BaziInfo, as: 'bazi_info', required: true }, // 必须有八字信息
        { model: Photo, as: 'photos', where: { is_primary: true }, required: false },
      ],
      order: this.sequelize.random(), // 随机排序
      limit: SAMPLE_SIZE,
    });

    // 4. 异步计算匹配度
    const scored = await Promise.all(
      candidates.map(async (user) => {
        const score = calculateCompatibility(currentUser.bazi_info!, user.bazi_info!);
        return { user, score };
      })
    );

    // 5. 过滤、排序、分页
    const matched = scored
      .filter(({ score }) => score >= MIN_COMPATIBILITY_SCORE)
      .sort((a, b) => b.score - a.score);

    const total = matched.length;
    const startIndex = (page - 1) * limit;
    const paginated = matched.slice(startIndex, startIndex + limit);

    // 6. 格式化结果
    const data = paginated.map(({ user, score }) => ({
      user: {
        id: user.id,
        username: user.username,
        gender: user.gender,
        birth_date: user.birth_date,
        photo: user.photos && user.photos.length > 0 ? user.photos[0].url : null,
      },
      compatibility_score: score,
    }));

    const result = { data, total };

    // 7. 写入缓存
    await cache.set(cacheKey, result, CACHE_TTL);

    return {
      ...result,
      hasMore: data.length === limit && startIndex + data.length < total,
    };
  }

  /**
   * 清除用户的推荐缓存
   */
  async clearCache(userId: string): Promise<void> {
    await cache.deletePattern(`recommendations:${userId}:*`);
  }

  private get sequelize() {
    // 动态导入避免循环依赖
    const { Sequelize } = require('sequelize');
    return Sequelize;
  }
}

export const recommendationService = new RecommendationService();
