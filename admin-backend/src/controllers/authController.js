const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../models/database');

exports.login = (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '请输入用户名和密码' });
  }

  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!admin) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }

  if (!bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    success: true,
    data: {
      token,
      admin: { id: admin.id, username: admin.username, role: admin.role }
    }
  });
};

exports.createAdmin = (req, res) => {
  const { username, password, role = 'reviewer' } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '请输入用户名和密码' });
  }

  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ success: false, message: '用户名已存在' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role);

  res.json({
    success: true,
    data: { id: result.lastInsertRowid, username, role }
  });
};

exports.getProfile = (req, res) => {
  const admin = db.prepare('SELECT id, username, role, created_at FROM admin_users WHERE id = ?').get(req.admin.id);
  res.json({ success: true, data: admin });
};
