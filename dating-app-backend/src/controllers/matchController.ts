import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Match, User } from '../models';
import {
  MATCH_STAGE,
  getMatchSelectableAttributes,
  findMatchByUsers,
  normalizeMatchStage,
  pickMatchAvailableFields,
  serializeMatchForViewer
} from '../services/matchService';

const getMatchWithUsers = async (matchId: string) => {
  const attributes = await getMatchSelectableAttributes();
  const match = await Match.findByPk(matchId, {
    attributes: attributes as any
  });
  if (!match) return null;

  const userIds = [match.getDataValue('user1_id'), match.getDataValue('user2_id')].filter(Boolean);
  const users = await User.findAll({
    where: { id: userIds as any },
    attributes: ['id', 'username', 'nickname', 'gender', 'avatar_url', 'im_user_id'] as any
  });
  const userMap = new Map(users.map((item: any) => [String(item.id), item]));

  return { match, userMap };
};

const getOtherUser = (match: any, userMap: Map<string, any>, viewerId: string) => {
  const user1Id = String(match.getDataValue('user1_id') || '');
  const user2Id = String(match.getDataValue('user2_id') || '');
  const otherId = user1Id === String(viewerId) ? user2Id : user1Id;
  return userMap.get(otherId) || null;
};

export const getMatchDetail = async (req: AuthRequest, res: Response) => {
  try {
    const rawMatchId = (req.params as any).matchId as string | string[] | undefined;
    const matchId = Array.isArray(rawMatchId) ? rawMatchId[0] : rawMatchId;
    const viewerId = req.user.id;
    if (!matchId) {
      return res.status(400).json({ success: false, message: 'Missing matchId' });
    }
    const context = await getMatchWithUsers(matchId);

    if (!context) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const { match, userMap } = context;
    const viewerInMatch = [match.getDataValue('user1_id'), match.getDataValue('user2_id')].some(
      (id: any) => String(id) === String(viewerId)
    );
    if (!viewerInMatch) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const otherUser = getOtherUser(match, userMap, viewerId);
    return res.status(200).json({
      success: true,
      data: serializeMatchForViewer({ match, viewerId, otherUser })
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const sendQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = req.user.id;
    const rawMatchId = (req.params as any).matchId as string | string[] | undefined;
    const matchId = Array.isArray(rawMatchId) ? rawMatchId[0] : rawMatchId;
    const question = String(req.body?.question || '').trim();

    if (!matchId) {
      return res.status(400).json({ success: false, message: 'Missing matchId' });
    }
    if (!question) {
      return res.status(400).json({ success: false, message: 'Question is required' });
    }

    const context = await getMatchWithUsers(matchId);
    if (!context) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const { match, userMap } = context;
    if (String(match.getDataValue('female_id') || '') !== String(viewerId)) {
      return res.status(403).json({ success: false, message: 'Only female can send question' });
    }

    const stage = normalizeMatchStage(match.getDataValue('stage'));
    if (![MATCH_STAGE.MATCHED, MATCH_STAGE.QUESTION_SENT].includes(stage as any)) {
      return res.status(400).json({ success: false, message: 'Current stage cannot send question' });
    }

    const updates = await pickMatchAvailableFields({
      female_question: question,
      male_answer: null,
      answer_created_at: null,
      question_created_at: new Date(),
      stage: MATCH_STAGE.QUESTION_SENT
    });
    await match.update(updates);

    const otherUser = getOtherUser(match, userMap, viewerId);
    return res.status(200).json({
      success: true,
      data: serializeMatchForViewer({ match, viewerId, otherUser })
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const answerQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = req.user.id;
    const rawMatchId = (req.params as any).matchId as string | string[] | undefined;
    const matchId = Array.isArray(rawMatchId) ? rawMatchId[0] : rawMatchId;
    const answer = String(req.body?.answer || '').trim();

    if (!matchId) {
      return res.status(400).json({ success: false, message: 'Missing matchId' });
    }
    if (!answer) {
      return res.status(400).json({ success: false, message: 'Answer is required' });
    }

    const context = await getMatchWithUsers(matchId);
    if (!context) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const { match, userMap } = context;
    if (String(match.getDataValue('male_id') || '') !== String(viewerId)) {
      return res.status(403).json({ success: false, message: 'Only male can answer question' });
    }

    const stage = normalizeMatchStage(match.getDataValue('stage'));
    if (stage !== MATCH_STAGE.QUESTION_SENT) {
      return res.status(400).json({ success: false, message: 'Question has not been sent yet' });
    }

    const updates = await pickMatchAvailableFields({
      male_answer: answer,
      answer_created_at: new Date(),
      stage: MATCH_STAGE.ANSWERED
    });
    await match.update(updates);

    const otherUser = getOtherUser(match, userMap, viewerId);
    return res.status(200).json({
      success: true,
      data: serializeMatchForViewer({ match, viewerId, otherUser })
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const startChat = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = req.user.id;
    const rawMatchId = (req.params as any).matchId as string | string[] | undefined;
    const matchId = Array.isArray(rawMatchId) ? rawMatchId[0] : rawMatchId;
    if (!matchId) {
      return res.status(400).json({ success: false, message: 'Missing matchId' });
    }
    const context = await getMatchWithUsers(matchId);

    if (!context) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const { match, userMap } = context;
    const shouldSendFirstMessage = !match.getDataValue('chat_start_message_sent');
    if (String(match.getDataValue('female_id') || '') !== String(viewerId)) {
      return res.status(403).json({ success: false, message: 'Only female can start chat' });
    }

    const stage = normalizeMatchStage(match.getDataValue('stage'));
    if (stage !== MATCH_STAGE.ANSWERED && stage !== MATCH_STAGE.CHAT_STARTED) {
      return res.status(400).json({ success: false, message: 'Answer required before starting chat' });
    }

    const updates = await pickMatchAvailableFields({
      chat_started_at: match.getDataValue('chat_started_at') || new Date(),
      chat_start_message_sent: true,
      stage: MATCH_STAGE.CHAT_STARTED
    });
    await match.update(updates);

    const otherUser = getOtherUser(match, userMap, viewerId);
    return res.status(200).json({
      success: true,
      data: {
        match: serializeMatchForViewer({ match, viewerId, otherUser }),
        starter_message: 'Hi,我们可以开始聊天了！',
        should_send_first_message: shouldSendFirstMessage,
        peer_im_user_id: otherUser?.im_user_id || null,
        peer_user_id: otherUser?.id || null
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMatchByUsers = async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = req.user.id;
    const rawUserId = (req.params as any).userId as string | string[] | undefined;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing userId' });
    }
    const match = await findMatchByUsers(viewerId, userId);
    if (!match) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const otherUser = await User.findByPk(userId, {
      attributes: ['id', 'username', 'nickname', 'gender', 'avatar_url', 'im_user_id'] as any
    });

    return res.status(200).json({
      success: true,
      data: serializeMatchForViewer({ match, viewerId, otherUser })
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
