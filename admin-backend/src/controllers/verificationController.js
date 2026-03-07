const { db } = require('../models/database');

// 获取待审核列表
exports.getPendingList = (req, res) => {
  const { type, status = 'pending', page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;

  let where = 'WHERE 1=1';
  const params = [];
  if (type) { where += ' AND type = ?'; params.push(type); }
  if (status) { where += ' AND status = ?'; params.push(status); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM verification_tasks ${where}`).get(...params).count;
  const list = db.prepare(`SELECT * FROM verification_tasks ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);

  res.json({ success: true, data: { list, total, page: Number(page), pageSize: Number(pageSize) } });
};

// 获取单条审核详情
exports.getTaskDetail = (req, res) => {
  const task = db.prepare('SELECT * FROM verification_tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, message: '审核任务不存在' });
  }
  res.json({ success: true, data: task });
};

// 审核通过（支持修改八字）
exports.approveTask = (req, res) => {
  const task = db.prepare('SELECT * FROM verification_tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, message: '审核任务不存在' });
  }

  const { year_pillar, month_pillar, day_pillar, hour_pillar, gender, note } = req.body;

  const reviewedData = {};
  if (task.type === 'bazi_review') {
    reviewedData.year_pillar = year_pillar || task.bazi_year_pillar;
    reviewedData.month_pillar = month_pillar || task.bazi_month_pillar;
    reviewedData.day_pillar = day_pillar || task.bazi_day_pillar;
    reviewedData.hour_pillar = hour_pillar || task.bazi_hour_pillar;
    reviewedData.gender = gender || task.gender;

    db.prepare(`
      UPDATE verification_tasks 
      SET status = 'approved', 
          bazi_year_pillar = ?, bazi_month_pillar = ?, bazi_day_pillar = ?, bazi_hour_pillar = ?,
          gender = ?, reviewed_data = ?, reviewer_id = ?, review_note = ?, reviewed_at = datetime('now')
      WHERE id = ?
    `).run(
      reviewedData.year_pillar, reviewedData.month_pillar, reviewedData.day_pillar, reviewedData.hour_pillar,
      reviewedData.gender, JSON.stringify(reviewedData), req.admin.id, note || '', task.id
    );
  } else {
    db.prepare(`
      UPDATE verification_tasks SET status = 'approved', reviewer_id = ?, review_note = ?, reviewed_at = datetime('now') WHERE id = ?
    `).run(req.admin.id, note || '', task.id);
  }

  res.json({ success: true, message: '审核通过' });
};

// 审核拒绝
exports.rejectTask = (req, res) => {
  const task = db.prepare('SELECT * FROM verification_tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, message: '审核任务不存在' });
  }

  const { note } = req.body;
  db.prepare(`
    UPDATE verification_tasks SET status = 'rejected', reviewer_id = ?, review_note = ?, reviewed_at = datetime('now') WHERE id = ?
  `).run(req.admin.id, note || '审核未通过', task.id);

  res.json({ success: true, message: '已拒绝' });
};

// 提交审核任务（供 dating-backend 调用）
exports.submitTask = (req, res) => {
  const { user_id, nickname, type, bazi_year_pillar, bazi_month_pillar, bazi_day_pillar, bazi_hour_pillar, gender, birth_date, submitted_data } = req.body;

  if (!user_id || !type) {
    return res.status(400).json({ success: false, message: '缺少必要参数' });
  }

  // 同类型待审核任务去重
  const existing = db.prepare('SELECT id FROM verification_tasks WHERE user_id = ? AND type = ? AND status = ?').get(user_id, type, 'pending');
  if (existing) {
    db.prepare(`
      UPDATE verification_tasks 
      SET bazi_year_pillar = ?, bazi_month_pillar = ?, bazi_day_pillar = ?, bazi_hour_pillar = ?,
          gender = ?, birth_date = ?, submitted_data = ?, nickname = ?, created_at = datetime('now')
      WHERE id = ?
    `).run(bazi_year_pillar, bazi_month_pillar, bazi_day_pillar, bazi_hour_pillar, gender, birth_date, JSON.stringify(submitted_data || {}), nickname || '', existing.id);

    return res.json({ success: true, data: { id: existing.id, status: 'pending' } });
  }

  const result = db.prepare(`
    INSERT INTO verification_tasks (user_id, nickname, type, bazi_year_pillar, bazi_month_pillar, bazi_day_pillar, bazi_hour_pillar, gender, birth_date, submitted_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user_id, nickname || '', type, bazi_year_pillar, bazi_month_pillar, bazi_day_pillar, bazi_hour_pillar, gender, birth_date, JSON.stringify(submitted_data || {}));

  res.json({ success: true, data: { id: result.lastInsertRowid, status: 'pending' } });
};

// 查询用户的审核状态
exports.getUserReviewStatus = (req, res) => {
  const { user_id } = req.params;
  const tasks = db.prepare('SELECT * FROM verification_tasks WHERE user_id = ? ORDER BY created_at DESC').all(user_id);
  
  const baziTask = tasks.find(t => t.type === 'bazi_review');
  const result = {
    bazi_review: baziTask ? {
      status: baziTask.status,
      reviewed_data: baziTask.reviewed_data ? JSON.parse(baziTask.reviewed_data) : null,
      year_pillar: baziTask.bazi_year_pillar,
      month_pillar: baziTask.bazi_month_pillar,
      day_pillar: baziTask.bazi_day_pillar,
      hour_pillar: baziTask.bazi_hour_pillar,
      gender: baziTask.gender
    } : null,
    education: tasks.find(t => t.type === 'education')?.status || null,
    company: tasks.find(t => t.type === 'company')?.status || null,
    real_name: tasks.find(t => t.type === 'real_name')?.status || null
  };

  res.json({ success: true, data: result });
};

// 统计概览
exports.getStats = (req, res) => {
  const pending = db.prepare("SELECT COUNT(*) as count FROM verification_tasks WHERE status = 'pending'").get().count;
  const approved = db.prepare("SELECT COUNT(*) as count FROM verification_tasks WHERE status = 'approved'").get().count;
  const rejected = db.prepare("SELECT COUNT(*) as count FROM verification_tasks WHERE status = 'rejected'").get().count;

  const byType = db.prepare(`
    SELECT type, status, COUNT(*) as count FROM verification_tasks GROUP BY type, status
  `).all();

  res.json({ success: true, data: { pending, approved, rejected, byType } });
};
