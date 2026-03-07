import { Router } from 'express';
import * as authController from '../controllers/authController';
import * as baziController from '../controllers/baziController';
import * as recommendationController from '../controllers/recommendationController';
import * as userController from '../controllers/userController';
import * as likeController from '../controllers/likeController';
import * as postController from '../controllers/postController';
import * as uploadController from '../controllers/uploadController';
import * as murronProxyController from '../controllers/murronProxyController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Auth Routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/phone-login', authController.phoneLogin);
router.post('/auth/phone-register', authController.phoneRegister);

// Google OAuth
router.get('/auth/google/url', authController.getGoogleAuthUrl);
router.get('/auth/google/callback', authController.googleCallback);
router.post('/auth/google/login', authController.googleLogin);

// WeChat OAuth
router.get('/auth/wechat/url', authController.getWechatAuthUrl);
router.get('/auth/wechat/callback', authController.wechatCallback);
router.post('/auth/wechat/login', authController.wechatLogin);

// Email code login
router.post('/auth/email/send-code', authController.sendEmailCode);
router.post('/auth/email/login', authController.emailCodeLogin);

// Admin login
router.post('/auth/admin/login', authController.adminLogin);

router.get('/auth/ping', (req, res) => res.json({ success: true, message: 'pong' }));

// Bazi Routes (无需登录即可计算)
router.post('/bazi/calculate', baziController.calculate);
router.post('/bazi/detailed-analysis', baziController.getDetailedAnalysis);
router.post('/bazi/soulmate-profile', baziController.getSoulmateProfile);
router.post('/bazi/fortune-timeline', baziController.getFortuneTimeline);
router.get('/bazi/report', authenticateToken, baziController.getReport);

// Murron API 代理路由（需登录）
router.get('/bazi/review-status', authenticateToken, murronProxyController.getReviewStatus);
router.post('/bazi/murron-analysis', authenticateToken, murronProxyController.getPersonalAnalysis);
router.post('/bazi/murron-compatibility', authenticateToken, murronProxyController.getCompatibilityAnalysis);

// Recommendation Routes
router.get('/recommendations', authenticateToken, recommendationController.getRecommendations);

// User & Verification Routes
router.post('/user/verify', authenticateToken, userController.submitVerification);
router.get('/user/verify', authenticateToken, userController.getVerificationStatus);
router.post('/user/photos', authenticateToken, userController.uploadPhoto);
router.get('/user/profile', authenticateToken, userController.getProfile);
router.put('/user/profile', authenticateToken, userController.updateProfile);

// Like Routes
router.post('/user/like/:targetId', authenticateToken, likeController.toggleLike);
router.get('/user/likes', authenticateToken, likeController.getMyLikes);

// Post Routes
router.post('/user/posts', authenticateToken, postController.createPost);
router.get('/user/:userId/posts', authenticateToken, postController.getUserPosts);

// Upload Routes
router.post('/uploads/base64', authenticateToken, uploadController.uploadImagesBase64);

// Message Routes
router.get('/messages', authenticateToken, userController.getConversations);
router.get('/messages/:targetId', authenticateToken, userController.getMessages);
router.post('/messages/:targetId', authenticateToken, userController.sendMessage);

export default router;
