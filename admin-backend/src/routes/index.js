const express = require('express');
const router = express.Router();
const { adminAuth, superAuth } = require('../middleware/auth');
const authCtrl = require('../controllers/authController');
const verifyCtrl = require('../controllers/verificationController');
const murronCtrl = require('../controllers/murronController');

// --- 公开接口 ---
router.post('/auth/login', authCtrl.login);

// --- 供 dating-backend 内部调用（无需管理员登录）---
router.post('/internal/verification/submit', verifyCtrl.submitTask);
router.get('/internal/verification/user/:user_id/status', verifyCtrl.getUserReviewStatus);

// --- Murron API 代理（供 dating-backend 调用）---
router.post('/internal/murron/personal', murronCtrl.getPersonalAnalysis);
router.post('/internal/murron/compatibility', murronCtrl.getCompatibilityAnalysis);
router.post('/internal/murron/dayun', murronCtrl.getDayunAnalysis);

// --- 管理员接口（需登录）---
router.get('/admin/profile', adminAuth, authCtrl.getProfile);
router.post('/admin/create-admin', adminAuth, superAuth, authCtrl.createAdmin);

router.get('/admin/verification/list', adminAuth, verifyCtrl.getPendingList);
router.get('/admin/verification/stats', adminAuth, verifyCtrl.getStats);
router.get('/admin/verification/:id', adminAuth, verifyCtrl.getTaskDetail);
router.post('/admin/verification/:id/approve', adminAuth, verifyCtrl.approveTask);
router.post('/admin/verification/:id/reject', adminAuth, verifyCtrl.rejectTask);

module.exports = router;
