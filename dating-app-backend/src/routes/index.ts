import { Router } from 'express';
import * as authController from '../controllers/authController';
import * as baziController from '../controllers/baziController';
import * as recommendationController from '../controllers/recommendationController';
import * as userController from '../controllers/userController';
import * as likeController from '../controllers/likeController';
import * as matchController from '../controllers/matchController';
import * as postController from '../controllers/postController';
import * as uploadController from '../controllers/uploadController';
import * as ossController from '../controllers/ossController';
import * as feedbackController from '../controllers/feedbackController';
import * as userAuthController from '../controllers/userAuthController';
import * as murronProxyController from '../controllers/murronProxyController';
import * as entitlementController from '../controllers/entitlementController';
import * as safetyController from '../controllers/safetyController';
import * as sessionController from '../controllers/sessionController';
import * as imController from '../controllers/imController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Auth Routes
router.post('/auth/register', sessionController.passwordRegister);
router.post('/auth/login', sessionController.passwordLogin);
router.post('/auth/phone-login', authController.phoneLogin);
router.post('/auth/phone-register', authController.phoneRegister);

// Google OAuth
router.get('/auth/google/url', authController.getGoogleAuthUrl);
router.get('/auth/google/callback', authController.googleCallback);
router.post('/auth/google/login', authController.googleLogin);

// WeChat OAuth
router.get('/auth/wechat/url', authController.getWechatAuthUrl);
router.get('/auth/wechat/callback', authController.wechatCallback);
router.post('/auth/wechat/login', sessionController.wechatSessionLogin);

// Unified session APIs
router.post('/auth/session/password/register', sessionController.passwordRegister);
router.post('/auth/session/password/login', sessionController.passwordLogin);
router.post('/auth/session/wechat', sessionController.wechatSessionLogin);
router.post('/auth/session/refresh', sessionController.refresh);
router.post('/auth/session/logout', sessionController.logout);
router.get('/auth/session/me', authenticateToken, sessionController.me);
router.post('/auth/session/bind-phone', authenticateToken, sessionController.bindPhone);

// Email code login
router.post('/auth/email/send-code', authController.sendEmailCode);
router.post('/auth/email/login', authController.emailCodeLogin);
router.post('/auth/decrypt', authController.decryptWechatData);
router.post('/auth/phone', authController.decryptWechatPhone);

// Admin login
router.post('/auth/admin/login', authController.adminLogin);

router.get('/auth/ping', (req, res) => res.json({ success: true, message: 'pong' }));

// Bazi Routes (无需登录即可计算)
router.post('/bazi/calculate', authenticateToken, baziController.calculate);
router.post('/bazi/detailed-analysis', baziController.getDetailedAnalysis);
router.post('/bazi/soulmate-profile', baziController.getSoulmateProfile);
router.post('/bazi/fortune-timeline', baziController.getFortuneTimeline);
router.get('/bazi/report', authenticateToken, baziController.getReport);

// Murron API 代理路由（需登录）
router.get('/bazi/review-status', authenticateToken, murronProxyController.getReviewStatus);
router.post('/bazi/murron-analysis', authenticateToken, murronProxyController.getPersonalAnalysis);
router.post('/bazi/murron-compatibility', authenticateToken, murronProxyController.getCompatibilityAnalysis);
router.post('/bazi/murron-dayun', authenticateToken, murronProxyController.getDayunAnalysis);

// Recommendation Routes
router.get('/recommendations', authenticateToken, recommendationController.getRecommendations);

// User & Verification Routes
router.post('/user/verify', authenticateToken, userController.submitVerification);
router.get('/user/verify', authenticateToken, userController.getVerificationStatus);
router.get('/user/auth-status', authenticateToken, userAuthController.getAuthStatus);
router.post('/user/auth/real-name', authenticateToken, userAuthController.submitRealNameAuth);
router.post('/user/auth/company', authenticateToken, userAuthController.submitCompanyAuth);
router.post('/user/auth/education', authenticateToken, userAuthController.submitEducationAuth);
router.post('/user/photos', authenticateToken, userController.uploadPhoto);
router.put('/user/photos', authenticateToken, userController.replacePhotos);
router.get('/user/profile', authenticateToken, userController.getProfile);
router.get('/user/:userId/profile', authenticateToken, userController.getPublicProfile);
router.get('/user/:userId/photo-wall', authenticateToken, userController.getPhotoWall);
router.put('/user/profile', authenticateToken, userController.updateProfile);

// Like Routes
router.post('/user/like/:targetId', authenticateToken, likeController.toggleLike);
router.get('/user/likes', authenticateToken, likeController.getMyLikes);
router.get('/user/liked-by', authenticateToken, likeController.getLikedBy);
router.get('/user/matches', authenticateToken, likeController.getMatches);
router.get('/user/likes/stats', authenticateToken, likeController.getLikeStats);
router.get('/matches/user/:userId', authenticateToken, matchController.getMatchByUsers);
router.get('/matches/:matchId', authenticateToken, matchController.getMatchDetail);

// Post Routes
router.post('/user/posts', authenticateToken, postController.createPost);
router.get('/user/:userId/posts', authenticateToken, postController.getUserPosts);
router.get('/posts/feed', authenticateToken, postController.getFeed);
router.get('/posts/:id', authenticateToken, postController.getPostDetail);
router.delete('/posts/:id', authenticateToken, postController.deletePost);
router.post('/posts/:id/like', authenticateToken, postController.likePost);
router.delete('/posts/:id/like', authenticateToken, postController.unlikePost);
router.get('/posts/:id/comments', authenticateToken, postController.getComments);
router.post('/posts/:id/comments', authenticateToken, postController.addComment);

// Upload Routes
router.post('/uploads/base64', authenticateToken, uploadController.uploadImagesBase64);
router.get('/oss/policy', authenticateToken, ossController.getUploadPolicy);
router.get('/oss/private-policy', authenticateToken, ossController.getPrivateUploadPolicy);
router.get('/internal/oss/private-object-url', ossController.getPrivateObjectUrl);

// Feedback
router.post('/feedback', authenticateToken, feedbackController.submitFeedback);

// Entitlements (test mode: unlock without real payment)
router.get('/entitlements', authenticateToken, entitlementController.getEntitlements);
router.post('/entitlements/unlock', authenticateToken, entitlementController.unlockEntitlement);
router.post('/entitlements/grant', authenticateToken, entitlementController.grantEntitlements);

// Message Routes
router.get('/messages', authenticateToken, userController.getConversations);
router.get('/messages/:targetId', authenticateToken, userController.getMessages);
router.post('/messages/:targetId', authenticateToken, userController.sendMessage);

// IM Routes
router.post('/im/easemob/token', authenticateToken, imController.getEasemobToken);

// Report & Block
router.post('/user/report', authenticateToken, safetyController.reportUser);
router.post('/user/block/:targetId', authenticateToken, safetyController.blockUser);
router.delete('/user/block/:targetId', authenticateToken, safetyController.unblockUser);
router.get('/user/blocks', authenticateToken, safetyController.getBlocks);

export default router;
