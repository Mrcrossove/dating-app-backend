import { Op, WhereOptions } from 'sequelize';
import sequelize from '../config/database';
import { AuthRecord, BaziInfo, Block, Like, Match, Photo, RecommendationHistory, Report, User } from '../models';
import { getSuperLikeBoostUserIds } from './vipService';
import { cache } from '../config/redis';

const DEFAULT_PAGE_SIZE = 20;
const SAMPLE_SIZE = 240;
const MAX_CARD_PHOTOS = 6;
const SUPER_LIKE_EXPOSURE_BOOST = 10;
const PHOTO_REQUIRED_FOR_DISCOVER = 'PHOTO_REQUIRED_FOR_DISCOVER';
const DISCOVER_CACHE_TTL_SECONDS = Math.max(60, Number(process.env.DISCOVER_CACHE_TTL_SECONDS || 600));
const RESHOW_COOLDOWN_HOURS = Math.max(1, Number(process.env.DISCOVER_RESHOW_COOLDOWN_HOURS || 72));

interface RecommendationParams {
  userId: string;
  page?: number;
  limit?: number;
  excludeIds?: string[];
  filters?: Record<string, unknown>;
  cursor?: string;
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
    auth_detail: {
      real_name: string;
      company: string;
      education: string;
    };
    day_master_label: string;
    favorable_elements: string[];
    recommend_reason: string;
    recommendation_type: string;
  };
  exposure_boost?: number;
  boosted?: boolean;
}

type CandidateUser = User & { bazi_info?: BaziInfo };

type RecommendationFilters = {
  gender?: string;
  ageMin?: number;
  ageMax?: number;
  location?: string[];
  heightMin?: number;
  heightMax?: number;
  educations?: string[];
  occupations?: string[];
  constellations?: string[];
  schools?: string[];
  onlyVerified?: boolean;
};

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

const normalizeFilters = (raw: Record<string, unknown> = {}): RecommendationFilters => {
  const toNumber = (value: unknown, fallback: number) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };
  const toTextArray = (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return uniqueStrings(value);
  };

  return {
    gender: safeText(raw.gender) || 'all',
    ageMin: Math.max(18, toNumber(raw.ageMin, 18)),
    ageMax: Math.min(60, toNumber(raw.ageMax, 60)),
    location: toTextArray(raw.location),
    heightMin: Math.max(0, toNumber(raw.heightMin, 0)),
    heightMax: Math.min(250, toNumber(raw.heightMax, 250)),
    educations: toTextArray(raw.educations),
    occupations: toTextArray(raw.occupations),
    constellations: toTextArray(raw.constellations),
    schools: toTextArray(raw.schools),
    onlyVerified: Boolean(raw.onlyVerified),
  };
};

const getDayMasterLabel = (baziInfo?: BaziInfo | null): string => {
  const dayPillar = safeText(baziInfo?.day_pillar);
  const element = safeText(baziInfo?.element);
  const dayStem = dayPillar.charAt(0);
  return safeText(`${dayStem}${element}`);
};

const getFavorableElements = (baziInfo?: BaziInfo | null): string[] => {
  const report = safeText(baziInfo?.report);
  if (!report) return [];

  const match = report.match(/喜用[:：]\s*([^\n]+)/);
  if (!match || !match[1]) return [];
  return uniqueStrings((match[1].match(/[金木水火土]/g) || []), 5);
};

const buildRecommendationReason = (params: {
  currentFavorableElements: string[];
  candidateElement: string;
  candidateDayMaster: string;
}) => {
  const { currentFavorableElements, candidateElement, candidateDayMaster } = params;

  if (candidateElement && currentFavorableElements.includes(candidateElement)) {
    return {
      recommendationType: '喜用互补',
      recommendReason: `对方日主${candidateDayMaster || candidateElement}，五行偏${candidateElement}，属于你的喜用方向`
    };
  }

  if (candidateElement) {
    return {
      recommendationType: '命理参考',
      recommendReason: `对方日主${candidateDayMaster || candidateElement}，可作为你的命理择偶参考对象`
    };
  }

  return {
    recommendationType: '基础推荐',
    recommendReason: '资料完整且符合你的当前筛选条件'
  };
};

const calculatePriorityScore = (params: {
  candidate: CandidateUser;
  favorableMatch: boolean;
  exposureBoost: number;
}) => {
  const { candidate, favorableMatch, exposureBoost } = params;
  let score = 0;

  if (favorableMatch) score += 1000;
  if (candidate.is_verified) score += 120;
  if (safeText(candidate.nickname)) score += 30;
  if (safeText(candidate.intro)) score += 20;
  if (safeText(candidate.education)) score += 10;
  if (safeText(candidate.job)) score += 10;
  if (safeText(candidate.profile_extras)) score += 10;

  return score + exposureBoost;
};

const matchesBackendFilters = (user: CandidateUser, filters: RecommendationFilters) => {
  const age = calculateAge(user.birth_date) || 0;
  const height = Number(user.height) || 0;
  const hometown = safeText(user.hometown);
  const school = safeText(user.school);
  const company = safeText(user.company);
  const locationText = `${hometown} ${school} ${company}`.trim();
  const ageMin = Math.min(Number(filters.ageMin) || 18, Number(filters.ageMax) || 60);
  const ageMax = Math.max(Number(filters.ageMin) || 18, Number(filters.ageMax) || 60);
  const heightMin = Math.min(Number(filters.heightMin) || 0, Number(filters.heightMax) || 250);
  const heightMax = Math.max(Number(filters.heightMin) || 0, Number(filters.heightMax) || 250);

  if (filters.onlyVerified && !user.is_verified) return false;
  if (age && (age < ageMin || age > ageMax)) return false;
  if (height && (height < heightMin || height > heightMax)) return false;

  if (filters.location && filters.location.length > 0) {
    const regionText = filters.location.join(' ');
    if (!locationText.includes(regionText)) return false;
  }

  if (filters.educations && filters.educations.length > 0 && !filters.educations.includes(safeText(user.education))) {
    return false;
  }

  if (filters.occupations && filters.occupations.length > 0 && !filters.occupations.includes(safeText(user.job))) {
    return false;
  }

  if (filters.constellations && filters.constellations.length > 0 && !filters.constellations.includes(safeText(user.constellation))) {
    return false;
  }

  if (filters.schools && filters.schools.length > 0) {
    const normalizedSchool = safeText(user.school);
    if (!filters.schools.some((schoolLabel) => normalizedSchool.includes(schoolLabel))) return false;
  }

  return true;
};

export class RecommendationService {
  private buildCacheKey(userId: string, filters: RecommendationFilters) {
    return `discover:${userId}:${Buffer.from(JSON.stringify(filters)).toString('base64')}`;
  }

  private encodeCursor(payload: Record<string, unknown>) {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private decodeCursor(cursor?: string) {
    if (!cursor) return null;
    try {
      return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch (_) {
      return null;
    }
  }

  async markCandidateAction(viewerId: string, candidateId: string, action: string) {
    const existing = await RecommendationHistory.findOne({
      where: { viewer_id: viewerId, candidate_id: candidateId }
    });
    if (!existing) return;
    await existing.update({
      last_action: String(action || 'shown').trim() || 'shown',
      last_shown_at: new Date()
    } as any);
  }

  async getRecommendations(params: RecommendationParams): Promise<{
    data: RecommendationResult[];
    total: number;
    hasMore: boolean;
    nextCursor: string;
  }> {
    const { userId, limit = DEFAULT_PAGE_SIZE, excludeIds = [], filters: rawFilters = {}, cursor } = params;
    const safeLimit = Math.max(1, Math.min(limit, 30));
    const filters = normalizeFilters(rawFilters);
    const cacheKey = this.buildCacheKey(userId, filters);
    const decodedCursor = this.decodeCursor(cursor);
    const startIndex = Math.max(0, Number(decodedCursor?.offset || 0));

    const currentUser = await User.findByPk(userId, {
      include: [{ model: BaziInfo, as: 'bazi_info' }],
    });

    if (!currentUser) {
      throw new Error('User not found');
    }

    const currentUserPhotoCount = await Photo.count({
      where: { user_id: userId }
    });

    if (currentUserPhotoCount < 1) {
      const error: any = new Error('At least one photo is required to access recommendations');
      error.code = PHOTO_REQUIRED_FOR_DISCOVER;
      throw error;
    }

    const targetGender = currentUser.gender === 'male' ? 'female' : 'male';
    if (filters.gender && filters.gender !== 'all' && filters.gender !== targetGender) {
      return {
        data: [],
        total: 0,
        hasMore: false,
        nextCursor: '',
      };
    }
    const allExcludedIds = new Set<string>([...excludeIds, userId].map((id) => String(id)));
    const currentFavorableElements = getFavorableElements(currentUser.bazi_info || null);
    const cooldownThreshold = new Date(Date.now() - RESHOW_COOLDOWN_HOURS * 60 * 60 * 1000);

    const [shownHistory, myLikes, blocks, reports, myMatches] = await Promise.all([
      RecommendationHistory.findAll({
        where: { viewer_id: userId },
        attributes: ['candidate_id', 'last_action', 'last_shown_at'] as any
      }),
      Like.findAll({
        where: { user_id: userId },
        attributes: ['target_id'] as any
      }),
      Block.findAll({
        where: { user_id: userId },
        attributes: ['target_id'] as any
      }),
      Report.findAll({
        where: { user_id: userId },
        attributes: ['target_id'] as any
      }),
      Match.findAll({
        where: {
          status: { [Op.ne]: 'blocked' },
          [Op.or]: [
            { user1_id: userId },
            { user2_id: userId }
          ]
        },
        attributes: ['user1_id', 'user2_id'] as any
      })
    ]);

    shownHistory.forEach((row: any) => {
      const candidateId = String(row.candidate_id || '');
      const lastAction = String(row.last_action || 'shown');
      const lastShownAt = row.last_shown_at ? new Date(row.last_shown_at) : null;
      const eligibleForReshow = lastAction === 'shown' && lastShownAt && lastShownAt <= cooldownThreshold;
      if (!eligibleForReshow) {
        allExcludedIds.add(candidateId);
      }
    });
    myLikes.forEach((row: any) => allExcludedIds.add(String(row.target_id || '')));
    blocks.forEach((row: any) => allExcludedIds.add(String(row.target_id || '')));
    reports.forEach((row: any) => allExcludedIds.add(String(row.target_id || '')));
    myMatches.forEach((row: any) => {
      const user1Id = String(row.user1_id || '');
      const user2Id = String(row.user2_id || '');
      if (user1Id && user1Id !== String(userId)) allExcludedIds.add(user1Id);
      if (user2Id && user2Id !== String(userId)) allExcludedIds.add(user2Id);
    });

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
        'created_at',
      ] as any,
      where: {
        gender: targetGender,
        id: { [Op.notIn]: Array.from(allExcludedIds) },
        is_active: true,
      } as WhereOptions,
      include: [{ model: BaziInfo, as: 'bazi_info', required: false }],
      order: [
        ['is_verified', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: SAMPLE_SIZE,
    })) as CandidateUser[];

    const candidateIds = candidates.map((user) => String(user.id));
    const candidatePhotos = await (
      candidateIds.length
        ? Photo.findAll({
            attributes: ['user_id'] as any,
            where: { user_id: { [Op.in]: candidateIds } },
            group: ['user_id']
          })
        : Promise.resolve([])
    );
    const candidateIdsWithPhoto = new Set(
      (candidatePhotos as any[]).map((photo) => String(photo.user_id || photo.getDataValue?.('user_id') || ''))
    );
    const candidatesWithPhoto = candidates.filter((user) => candidateIdsWithPhoto.has(String(user.id)));

    const filteredCandidates = candidatesWithPhoto.filter((user) => matchesBackendFilters(user, filters));
    const superLikeBoostUserIds = await getSuperLikeBoostUserIds(filteredCandidates.map((user) => String(user.id)));

    let orderedCandidateIds = (await cache.get<string[]>(cacheKey)) || [];
    if (!orderedCandidateIds.length || startIndex === 0) {
      const matched = filteredCandidates
        .map((user) => {
        const candidateElement = safeText(user.bazi_info?.element);
        const candidateDayMaster = getDayMasterLabel(user.bazi_info || null);
        const exposureBoost = superLikeBoostUserIds.has(String(user.id)) ? SUPER_LIKE_EXPOSURE_BOOST : 0;
        const favorableMatch = !!(candidateElement && currentFavorableElements.includes(candidateElement));

        return {
          user,
          favorableMatch,
          exposureBoost,
          priorityScore: calculatePriorityScore({
            candidate: user,
            favorableMatch,
            exposureBoost
          }),
          ...buildRecommendationReason({
            currentFavorableElements,
            candidateElement,
            candidateDayMaster
          })
        };
        })
        .sort((a, b) => {
          if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
          if (b.exposureBoost !== a.exposureBoost) return b.exposureBoost - a.exposureBoost;
          return new Date(String(b.user.created_at || 0)).getTime() - new Date(String(a.user.created_at || 0)).getTime();
        });

      orderedCandidateIds = matched.map(({ user }) => String(user.id));
      await cache.set(cacheKey, orderedCandidateIds, DISCOVER_CACHE_TTL_SECONDS);
    }

    const total = orderedCandidateIds.length;
    const paginatedUserIds = orderedCandidateIds.slice(startIndex, startIndex + safeLimit);
    const paginatedCandidateMap = new Map(filteredCandidates.map((user) => [String(user.id), user]));

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
    const authRecords = await (
      paginatedUserIds.length
        ? AuthRecord.findAll({
            where: {
              user_id: { [Op.in]: paginatedUserIds },
              type: { [Op.in]: ['real_name', 'company', 'education'] },
            },
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
    const authMap = new Map<string, { real_name: string; company: string; education: string }>();
    (authRecords as any[]).forEach((record) => {
      const ownerId = String(record.user_id);
      const current = authMap.get(ownerId) || { real_name: 'none', company: 'none', education: 'none' };
      const type = safeText(record.type);
      const status = safeText(record.status) || 'none';
      if (type === 'real_name' || type === 'company' || type === 'education') {
        (current as any)[type] = status;
      }
      authMap.set(ownerId, current);
    });

    const data = paginatedUserIds.map((candidateId) => {
      const user = paginatedCandidateMap.get(String(candidateId)) as CandidateUser;
      const candidateElement = safeText(user?.bazi_info?.element);
      const candidateDayMaster = getDayMasterLabel(user?.bazi_info || null);
      const exposureBoost = superLikeBoostUserIds.has(String(candidateId)) ? SUPER_LIKE_EXPOSURE_BOOST : 0;
      const { recommendReason, recommendationType } = buildRecommendationReason({
        currentFavorableElements,
        candidateElement,
        candidateDayMaster
      });
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
      const dayMasterLabel = getDayMasterLabel(user.bazi_info || null);
      const favorableElements = getFavorableElements(user.bazi_info || null);
      const authDetail = authMap.get(String(user.id)) || {
        real_name: user.is_verified ? 'approved' : 'none',
        company: 'none',
        education: 'none',
      };

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
          auth_detail: authDetail,
          day_master_label: dayMasterLabel,
          favorable_elements: favorableElements,
          recommend_reason: recommendReason,
          recommendation_type: recommendationType,
        },
        exposure_boost: exposureBoost || 0,
        boosted: exposureBoost > 0,
      };
    });

    await Promise.all(
      paginatedUserIds.map(async (candidateId) => {
        const [row, created] = await RecommendationHistory.findOrCreate({
          where: { viewer_id: userId, candidate_id: candidateId },
          defaults: {
            viewer_id: userId,
            candidate_id: candidateId,
            shown_count: 1,
            last_action: 'shown',
            first_shown_at: new Date(),
            last_shown_at: new Date()
          } as any
        });

        if (!created) {
          await row.update({
            shown_count: Number((row as any).shown_count || 0) + 1,
            last_action: 'shown',
            last_shown_at: new Date()
          } as any);
        }
      })
    );

    const nextOffset = startIndex + data.length;
    return {
      data,
      total,
      hasMore: nextOffset < total,
      nextCursor: nextOffset < total ? this.encodeCursor({ offset: nextOffset, cacheKey }) : '',
    };
  }

  async clearCache(userId: string): Promise<void> {
    await cache.deletePattern(`discover:${userId}:*`);
  }

  async clearDiscoverCache(): Promise<void> {
    await cache.deletePattern('discover:*');
  }
}

export const recommendationService = new RecommendationService();
