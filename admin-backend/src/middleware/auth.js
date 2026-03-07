const jwt = require('jsonwebtoken');

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未登录' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'token 已过期或无效' });
  }
}

function superAuth(req, res, next) {
  if (req.admin.role !== 'super') {
    return res.status(403).json({ success: false, message: '权限不足' });
  }
  next();
}

module.exports = { adminAuth, superAuth };
