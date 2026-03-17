import { Match } from '../models';

export const MATCH_STAGE = {
  MATCHED: 'matched',
  QUESTION_SENT: 'question_sent',
  ANSWERED: 'answered',
  CHAT_STARTED: 'chat_started'
} as const;

export const getOrderedPair = (a: string, b: string) => (
  String(a) < String(b) ? [String(a), String(b)] : [String(b), String(a)]
);

export const findMatchByUsers = async (userAId: string, userBId: string) => {
  const [user1Id, user2Id] = getOrderedPair(userAId, userBId);
  return Match.findOne({
    where: {
      user1_id: user1Id,
      user2_id: user2Id
    }
  });
};

export const normalizeMatchStage = (value: any) => {
  const stage = String(value || '').trim();
  if (Object.values(MATCH_STAGE).includes(stage as any)) return stage;
  return MATCH_STAGE.MATCHED;
};

export const resolveRoles = (userA: any, userB: any) => {
  const aGender = String(userA?.gender || '').trim();
  const bGender = String(userB?.gender || '').trim();

  if (aGender === 'female' && bGender === 'male') {
    return { femaleId: String(userA.id), maleId: String(userB.id) };
  }
  if (aGender === 'male' && bGender === 'female') {
    return { femaleId: String(userB.id), maleId: String(userA.id) };
  }

  return {
    femaleId: aGender === 'female' ? String(userA.id) : (bGender === 'female' ? String(userB.id) : null),
    maleId: aGender === 'male' ? String(userA.id) : (bGender === 'male' ? String(userB.id) : null)
  };
};

export const ensureMatchForUsers = async (userA: any, userB: any) => {
  const [user1Id, user2Id] = getOrderedPair(String(userA.id), String(userB.id));
  const roles = resolveRoles(userA, userB);

  const [match] = await Match.findOrCreate({
    where: { user1_id: user1Id, user2_id: user2Id },
    defaults: {
      user1_id: user1Id,
      user2_id: user2Id,
      female_id: roles.femaleId,
      male_id: roles.maleId,
      compatibility_score: 50,
      status: 'active',
      stage: MATCH_STAGE.MATCHED
    } as any
  });

  const updates: Record<string, any> = {};
  if (!match.getDataValue('female_id') && roles.femaleId) updates.female_id = roles.femaleId;
  if (!match.getDataValue('male_id') && roles.maleId) updates.male_id = roles.maleId;
  if (!match.getDataValue('stage')) updates.stage = MATCH_STAGE.MATCHED;
  if (Object.keys(updates).length) {
    await match.update(updates);
  }

  return match;
};

export const serializeMatchForViewer = (params: {
  match: any;
  viewerId: string;
  otherUser?: any;
}) => {
  const { match, viewerId, otherUser } = params;
  if (!match) return null;

  const plain = typeof match.toJSON === 'function' ? match.toJSON() : match;
  const stage = normalizeMatchStage(plain.stage);
  const femaleId = plain.female_id ? String(plain.female_id) : '';
  const maleId = plain.male_id ? String(plain.male_id) : '';
  const viewer = String(viewerId);
  const myRole = viewer && viewer === femaleId ? 'female' : (viewer && viewer === maleId ? 'male' : 'viewer');

  return {
    id: plain.id,
    stage,
    status: plain.status,
    compatibility_score: Number(plain.compatibility_score || 0),
    female_id: plain.female_id || null,
    male_id: plain.male_id || null,
    female_question: plain.female_question || '',
    male_answer: plain.male_answer || '',
    question_created_at: plain.question_created_at || null,
    answer_created_at: plain.answer_created_at || null,
    chat_started_at: plain.chat_started_at || null,
    chat_start_message_sent: !!plain.chat_start_message_sent,
    my_role: myRole,
    can_chat: stage === MATCH_STAGE.CHAT_STARTED,
    can_send_question: myRole === 'female' && stage === MATCH_STAGE.MATCHED,
    can_answer_question: myRole === 'male' && stage === MATCH_STAGE.QUESTION_SENT,
    can_start_chat: myRole === 'female' && stage === MATCH_STAGE.ANSWERED,
    other_user: otherUser ? {
      id: otherUser.id,
      im_user_id: otherUser.im_user_id || null,
      gender: otherUser.gender || '',
      nickname: otherUser.nickname || otherUser.username || '',
      avatar_url: otherUser.avatar_url || null
    } : null
  };
};
