import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { recommendationService } from '../services/recommendationService';

export const getRecommendations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await recommendationService.getRecommendations({
      userId,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      meta: {
        page,
        limit,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  } catch (error: any) {
    const statusCode = error?.code === 'PHOTO_REQUIRED_FOR_DISCOVER'
      ? 403
      : (error.message.includes('bazi calculation') ? 400 : 500);
    return res.status(statusCode).json({
      success: false,
      code: error?.code || '',
      message: error.message,
    });
  }
};
