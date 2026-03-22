import { Op } from 'sequelize';
import { cache } from '../config/redis';
import sequelize from '../config/database';
import { BaziInfo, Photo, User } from '../models';
import { calculateCompatibility } from './baziService';
import { getSuperLikeBoostUserIds } from './vipService';

const CACHE_TTL = 300;
const MIN_COMPATIBILITY_SCORE = 70;
const DEFAULT_PAGE_SIZE = 20;
const SAMPLE_SIZE = 60;
const MAX_CARD_PHOTOS = 6;
const SUPER_LIKE_EXPOSURE_BOOST = 10;

interface RecommendationParams {
  userId: string;
  page?: number;
  limit?: number;
  excludeIds?: string[];
}

interface DiscoverQaItem {
  id: string;
  question: string;
  answer: string;
}

interface DiscoverLifestyleItem {
  id: string;
  text: string;
}

interface DiscoverWishItem {
  id: string;
  title: string;
  desc: string;
}

interface ParsedProfileExtras {
  purpose: string;
  expectation: string;
  qaList: DiscoverQaItem[];
  lifestyleList: DiscoverLifestyleItem[];
  wishList: DiscoverWishItem[];
}

interface RecommendationResult {
  user: {
    id: string;
    username: string;
    nickname: string;
    gender: string;
    birth_date: Date;
    age: number | null;
    avatar: string;
    avatar_thumb: string;
    primary_photo: string;
    primary_photo_thumb: string;
    photos: string[];
    photo_count: number;
    hometown: string;
    school: string;
    company: string;
    job: string;
    education: string;
    height: string;
    constellation: string;
    mbti: string;
    intro: string;
    love_view: string;
    purpose: string;
    expectation: string;
    interests: string[];
    tags: string[];
    qaList: DiscoverQaItem[];
    lifestyleList: DiscoverLifestyleItem[];
    wishList: DiscoverWishItem[];
    is_verified: boolean;
  };
  compatibility_score: number;
  exposure_boost?: number;
  boosted?: boolean;
}

type CandidateUser = User & { bazi_info?: BaziInfo };

const safeText = (value: unknown, maxLength = 0): string => {
  const text = String(value || '').trim();
  if (!text) return '';
  return maxLength > 0 ? text.slice(0, maxLength) : text;
};

const safeJsonParse = (value: unknown): any => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
};

const uniqueStrings = (items: Array<unknown>, limit = 0): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];

  items.forEach((item) => {
    const text = safeText(item);
    if (!text || seen.has(text)) return;
    seen.add(text);
    output.push(text);
  });

  return limit > 0 ? output.slice(0, limit) : output;
};

const buildOssThumbUrl = (url: unknown, width: number, quality = 62): string => {
  const source = safeText(url);
  if (!source || !/^https?:\/\//i.test(source)) return source;
  if (source.includes('x-oss-process=')) return source;

  let hostname = '';
  try {
    hostname = new URL(source).hostname.toLowerCase();
  } catch (_) {
    return source;
  }

  const isOssDomain = hostname.endsWith('aliyuncs.com') && hostname.includes('.oss-');
  if (!isOssDomain) return source;

  const separator = source.includes('?') ? '&' : '?';
  return `${source}${separator}x-oss-process=image/resize,m_fill,w_${Math.max(240, width)}/quality,Q_${Math.max(40, Math.min(quality, 90))}/format,webp`;
};

const normalizeTextArray = (value: unknown, limit = 0): string[] => {
  if (Array.isArray(value)) return uniqueStrings(value, limit);

  const parsed = safeJsonParse(value);
  if (Array.isArray(parsed)) return uniqueStrings(parsed, limit);

  const text = safeText(value);
  if (!text) return [];

  return uniqueStrings(text.split(/[\n,，、|]/), limit);
};

const parseProfileExtras = (raw: unknown): ParsedProfileExtras => {
  const parsed: any = typeof raw === 'object' && raw ? raw : safeJsonParse(raw) || {};

  const qaList = Array.isArray(parsed.qaList)
    ? parsed.qaList
        .map((item: any, index: number) => ({
          id: safeText(item?.id) || `qa_${index + 1}`,
          question: safeText(item?.question || item?.title || item?.prompt),
          answer: safeText(item?.answer, 80),
        }))
        .filter((item: DiscoverQaItem) => item.question && item.answer)
        .slice(0, 2)
    : [];

  const lifestyleList = Array.isArray(parsed.lifestyleList)
    ? parsed.lifestyleList
        .map((item: any, index: number) => ({
          id: safeText(item?.id) || `life_${index + 1}`,
          text: safeText(item?.text || item?.title, 30),
        }))
        .filter((item: DiscoverLifestyleItem) => item.text)
        .slice(0, 3)
    : [];

  const wishList = Array.isArray(parsed.wishList)
    ? parsed.wishList
        .map((item: any, index: number) => ({
          id: safeText(item?.id) || `wish_${index + 1}`,
          title: safeText(item?.title || item?.text, 30),
          desc: safeText(item?.desc, 40),
        }))
        .filter((item: DiscoverWishItem) => item.title)
        .slice(0, 3)
    : [];

  return {
    purpose: safeText(parsed.purpose, 24),
    expectation: safeText(parsed.expectation, 48),
    qaList,
    lifestyleList,
    wishList,
  };
};

const calculateAge = (birthDate: unknown): number | null => {
  if (!birthDate) return null;
  const date = birthDate instanceof Date ? birthDate : new Date(String(birthDate));
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age > 0 ? age : null;
};

const formatHeight = (value: unknown): string => {
  const height = Number(value);
  if (!Number.isFinite(height) || height <= 0) return '';
  return `${Math.round(height)}cm`;
};

const buildPhotoWall = (params: {
  avatarUrl: string;
  photoUrls: string[];
}): string[] => {
  const { avatarUrl, photoUrls } = params;
  return uniqueStrings([avatarUrl, ...photoUrls], MAX_CARD_PHOTOS);
};

const buildDiscoverTags = (params: {
  height: string;
  education: string;
  job: string;
  hometown: string;
  school: string;
  constellation: string;
  mbti: string;
  purpose: string;
  interests: string[];
}): string[] => {
  const { height, education, job, hometown, school, constellation, mbti, purpose, interests } = params;

  return uniqueStrings(
    [
      height,
      education,
      job,
      hometown ? `家乡 ${hometown}` : '',
      school,
      constellation,
      mbti,
      purpose ? `目的 ${purpose}` : '',
      ...interests,
    ],
    8
  );
};

const calculateFallbackScore = (user: CandidateUser): number => {
  let score = 72;

  if (user.is_verified) score += 8;
  if (safeText(user.nickname)) score += 3;
  if (safeText(user.intro)) score += 3;
  if (safeText(user.education)) score += 2;
  if (safeText(user.job)) score += 2;
  if (safeText(user.profile_extras)) score += 3;

  return Math.min(95, score);
};

export class RecommendationService {
  async getRecommendations(params: RecommendationParams): Promise<{
    data: RecommendationResult[];
    total: number;
    hasMore: boolean;
  }> {
    const { userId, page = 1, limit = DEFAULT_PAGE_SIZE, excludeIds = [] } = params;
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(limit, 30));
    const cacheKey = `discover:${userId}:page${safePage}:limit${safeLimit}`;

    const cached = await cache.get<{ data: RecommendationResult[]; total: number }>(cacheKey);
    if (cached) {
      return {
        ...cached,
        hasMore: safePage * safeLimit < cached.total,
      };
    }

    const currentUser = await User.findByPk(userId, {
      include: [{ model: BaziInfo, as: 'bazi_info' }],
    });

    if (!currentUser) {
      throw new Error('User not found');
    }

    const targetGender = currentUser.gender === 'male' ? 'female' : 'male';
    const allExcludedIds = [...excludeIds, userId];

    const candidates = (await User.findAll({
      attributes: [
        'id',
        'username',
        'nickname',
        'gender',
        'birth_date',
        'avatar_url',
        'hometown',
        'school',
        'company',
        'job',
        'education',
        'height',
        'constellation',
        'mbti',
        'intro',
        'love_view',
        'interests',
        'profile_extras',
        'is_verified',
      ] as any,
      where: {
        gender: targetGender,
        id: { [Op.notIn]: allExcludedIds },
        is_active: true,
      },
      include: [{ model: BaziInfo, as: 'bazi_info', required: false }],
      order: sequelize.random(),
      limit: SAMPLE_SIZE,
    })) as CandidateUser[];

    const superLikeBoostUserIds = await getSuperLikeBoostUserIds(candidates.map((user) => String(user.id)));

    const scored = await Promise.all(
      candidates.map(async (user) => ({
        user,
        baseScore:
          currentUser.bazi_info && user.bazi_info
            ? calculateCompatibility(currentUser.bazi_info, user.bazi_info)
            : calculateFallbackScore(user),
        exposureBoost: superLikeBoostUserIds.has(String(user.id)) ? SUPER_LIKE_EXPOSURE_BOOST : 0,
      }))
    );

    const matched = scored
      .map((item) => ({
        ...item,
        score: Math.min(100, item.baseScore + item.exposureBoost),
      }))
      .filter(({ score }) => score >= MIN_COMPATIBILITY_SCORE)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.exposureBoost !== a.exposureBoost) return b.exposureBoost - a.exposureBoost;
        return b.baseScore - a.baseScore;
      });

    const total = matched.length;
    const startIndex = (safePage - 1) * safeLimit;
    const paginated = matched.slice(startIndex, startIndex + safeLimit);
    const paginatedUserIds = paginated.map(({ user }) => String(user.id));

    const photos = await (
      paginatedUserIds.length
        ? Photo.findAll({
            where: { user_id: { [Op.in]: paginatedUserIds } },
            order: [
              ['user_id', 'ASC'],
              ['is_primary', 'DESC'],
              ['created_at', 'DESC'],
            ],
          })
        : Promise.resolve([])
    );

    const photoMap = new Map<string, string[]>();
    (photos as any[]).forEach((photo) => {
      const ownerId = String(photo.user_id);
      const current = photoMap.get(ownerId) || [];
      if (current.length >= MAX_CARD_PHOTOS) return;
      current.push(safeText(photo.url));
      photoMap.set(ownerId, current);
    });

    const data = paginated.map(({ user, score, exposureBoost }) => {
      const extras = parseProfileExtras(user.profile_extras);
      const interests = normalizeTextArray(user.interests, 4);
      const photoWall = buildPhotoWall({
        avatarUrl: safeText(user.avatar_url),
        photoUrls: photoMap.get(String(user.id)) || [],
      });
      const primaryPhoto = photoWall[0] || '';
      const avatar = primaryPhoto;
      const avatarThumb = buildOssThumbUrl(avatar, 320, 58);
      const primaryPhotoThumb = buildOssThumbUrl(primaryPhoto, 720, 62);
      const height = formatHeight(user.height);
      const education = safeText(user.education);
      const job = safeText(user.job);
      const hometown = safeText(user.hometown);
      const school = safeText(user.school);
      const constellation = safeText(user.constellation);
      const mbti = safeText(user.mbti);
      const purpose = extras.purpose;
      const expectation = extras.expectation;

      return {
        user: {
          id: String(user.id),
          username: safeText(user.username),
          nickname: safeText(user.nickname) || safeText(user.username) || 'User',
          gender: safeText(user.gender),
          birth_date: user.birth_date,
          age: calculateAge(user.birth_date),
          avatar,
          avatar_thumb: avatarThumb,
          primary_photo: primaryPhoto,
          primary_photo_thumb: primaryPhotoThumb,
          photos: primaryPhoto ? [primaryPhoto] : [],
          photo_count: photoWall.length,
          hometown,
          school,
          company: safeText(user.company),
          job,
          education,
          height,
          constellation,
          mbti,
          intro: safeText(user.intro, 120),
          love_view: safeText(user.love_view, 120),
          purpose,
          expectation,
          interests,
          tags: buildDiscoverTags({
            height,
            education,
            job,
            hometown,
            school,
            constellation,
            mbti,
            purpose,
            interests,
          }),
          qaList: extras.qaList,
          lifestyleList: extras.lifestyleList,
          wishList: extras.wishList,
          is_verified: Boolean(user.is_verified),
        },
        compatibility_score: Math.round(score),
        exposure_boost: exposureBoost || 0,
        boosted: exposureBoost > 0,
      };
    });

    const result = { data, total };
    await cache.set(cacheKey, result, CACHE_TTL);

    return {
      ...result,
      hasMore: startIndex + data.length < total,
    };
  }

  async clearCache(userId: string): Promise<void> {
    await cache.deletePattern(`discover:${userId}:*`);
    await cache.deletePattern(`recommendations:${userId}:*`);
  }

  async clearDiscoverCache(): Promise<void> {
    await cache.deletePattern('discover:*');
    await cache.deletePattern('recommendations:*');
  }
}

export const recommendationService = new RecommendationService();
