const axios = require('axios');
const { db } = require('../models/database');

const INTERNAL_API_BASE = String(process.env.API_INTERNAL_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');
const INTERNAL_SERVICE_TOKEN = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();

const TYPE_ORDER = ['bazi_review', 'real_name', 'company', 'education'];
const TYPE_LABELS = {
  bazi_review: '八字审核',
  real_name: '真人认证',
  company: '工作认证',
  education: '学历认证'
};

function safeParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function normalizeTask(task) {
  if (!task) return null;
  return {
    ...task,
    submitted_data: safeParse(task.submitted_data),
    reviewed_data: safeParse(task.reviewed_data)
  };
}

function getPreviewPayload(task) {
  const submitted = task?.submitted_data || {};
  const authImage = submitted && typeof submitted.authImage === 'object' ? submitted.authImage : null;
  const imageUrl = String(submitted?.imageUrl || submitted?.image || '').trim();

  if (authImage && authImage.bucket && authImage.key) {
    return {
      mode: 'private',
      bucket: String(authImage.bucket).trim(),
      key: String(authImage.key).trim(),
      filename: String(authImage.filename || '').trim()
    };
  }

  if (imageUrl) {
    return {
      mode: 'public',
      url: imageUrl
    };
  }

  return null;
}

function recordMaterialAccess(params) {
  const {
    adminId,
    taskId,
    userId,
    type,
    bucket,
    key,
    mode,
    ip,
    userAgent
  } = params;

  db.prepare(`
    INSERT INTO auth_material_access_logs (
      admin_id, task_id, user_id, type, bucket, object_key, access_mode, ip, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    adminId,
    taskId,
    userId,
    type,
    bucket || '',
    key || '',
    mode,
    ip || '',
    userAgent || ''
  );
}

function sortByPriority(list) {
  return [...list].sort((a, b) => {
    const score = (status) => {
      if (status === 'pending') return 3;
      if (status === 'approved') return 2;
      if (status === 'rejected') return 1;
      return 0;
    };
    const diff = score(b.status) - score(a.status);
    if (diff !== 0) return diff;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

function pickTaskByPriority(tasks, type) {
  const list = tasks.filter((task) => task.type === type);
  if (!list.length) return null;
  return sortByPriority(list)[0];
}

function buildUserAggregate(tasks) {
  if (!tasks.length) return null;
  const normalizedTasks = tasks.map(normalizeTask);
  const first = normalizedTasks[0];
  const byType = {};

  TYPE_ORDER.forEach((type) => {
    byType[type] = pickTaskByPriority(normalizedTasks, type);
  });

  const statuses = TYPE_ORDER.map((type) => byType[type]?.status).filter(Boolean);
  const pendingCount = statuses.filter((status) => status === 'pending').length;
  const approvedCount = statuses.filter((status) => status === 'approved').length;
  const rejectedCount = statuses.filter((status) => status === 'rejected').length;

  return {
    user_id: first.user_id,
    nickname: first.nickname || '',
    latest_submitted_at: normalizedTasks
      .map((task) => task.created_at)
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)))[0] || '',
    pending_count: pendingCount,
    approved_count: approvedCount,
    rejected_count: rejectedCount,
    overall_status: pendingCount > 0 ? 'pending' : rejectedCount > 0 ? 'rejected' : approvedCount > 0 ? 'approved' : 'none',
    tasks: byType
  };
}

function getUserTasks(userId) {
  const rows = db
    .prepare('SELECT * FROM verification_tasks WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);
  return rows.map(normalizeTask);
}

function getTaskForReview(userId, type) {
  const task = db
    .prepare(
      `SELECT * FROM verification_tasks
       WHERE user_id = ? AND type = ?
       ORDER BY
         CASE status
           WHEN 'pending' THEN 3
           WHEN 'approved' THEN 2
           WHEN 'rejected' THEN 1
           ELSE 0
         END DESC,
         created_at DESC
       LIMIT 1`
    )
    .get(userId, type);
  return normalizeTask(task);
}

function applyApprove(task, adminId, body) {
  const note = body.note || '';
  if (task.type === 'bazi_review') {
    const reviewedData = {
      year_pillar: body.year_pillar || task.bazi_year_pillar,
      month_pillar: body.month_pillar || task.bazi_month_pillar,
      day_pillar: body.day_pillar || task.bazi_day_pillar,
      hour_pillar: body.hour_pillar || task.bazi_hour_pillar,
      current_luck_pillar: body.current_luck_pillar || task.current_luck_pillar || '',
      gender: body.gender || task.gender || ''
    };

    db.prepare(`
      UPDATE verification_tasks
      SET status = 'approved',
          bazi_year_pillar = ?, bazi_month_pillar = ?, bazi_day_pillar = ?, bazi_hour_pillar = ?,
          current_luck_pillar = ?, gender = ?, reviewed_data = ?, reviewer_id = ?, review_note = ?, reviewed_at = datetime('now')
      WHERE id = ?
    `).run(
      reviewedData.year_pillar,
      reviewedData.month_pillar,
      reviewedData.day_pillar,
      reviewedData.hour_pillar,
      reviewedData.current_luck_pillar,
      reviewedData.gender,
      JSON.stringify(reviewedData),
      adminId,
      note,
      task.id
    );
    return;
  }

  db.prepare(`
    UPDATE verification_tasks
    SET status = 'approved', reviewer_id = ?, review_note = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).run(adminId, note, task.id);
}

function applyReject(task, adminId, body) {
  const note = body.note || '审核未通过';
  db.prepare(`
    UPDATE verification_tasks
    SET status = 'rejected', reviewer_id = ?, review_note = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).run(adminId, note, task.id);
}

function buildDashboardData() {
  const allTasks = db.prepare('SELECT * FROM verification_tasks ORDER BY created_at DESC').all();
  const userMap = new Map();

  allTasks.forEach((task) => {
    const userId = String(task.user_id);
    const list = userMap.get(userId) || [];
    list.push(task);
    userMap.set(userId, list);
  });

  const users = [...userMap.values()].map(buildUserAggregate).filter(Boolean);
  const totalUsers = users.length;
  const pendingUsers = users.filter((item) => item.pending_count > 0).length;
  const approvedUsers = users.filter((item) => item.pending_count === 0 && item.rejected_count === 0 && item.approved_count > 0).length;
  const rejectedUsers = users.filter((item) => item.pending_count === 0 && item.rejected_count > 0).length;
  const totalReviewed = approvedUsers + rejectedUsers;
  const approvalRate = totalReviewed > 0 ? Math.round((approvedUsers / totalReviewed) * 100) : 0;

  const typeStats = TYPE_ORDER.map((type) => {
    const rows = allTasks.filter((task) => task.type === type);
    return {
      type,
      label: TYPE_LABELS[type],
      total: rows.length,
      pending: rows.filter((task) => task.status === 'pending').length,
      approved: rows.filter((task) => task.status === 'approved').length,
      rejected: rows.filter((task) => task.status === 'rejected').length
    };
  });

  const statusBoard = [
    { key: 'pending', label: '待审核', value: allTasks.filter((task) => task.status === 'pending').length },
    { key: 'approved', label: '已通过', value: allTasks.filter((task) => task.status === 'approved').length },
    { key: 'rejected', label: '已拒绝', value: allTasks.filter((task) => task.status === 'rejected').length }
  ];

  const recentSubmissions = allTasks.slice(0, 8).map((task) => ({
    id: task.id,
    user_id: task.user_id,
    nickname: task.nickname || '',
    type: task.type,
    status: task.status,
    created_at: task.created_at
  }));

  return {
    totals: {
      totalUsers,
      pendingUsers,
      approvedUsers,
      rejectedUsers,
      approvalRate
    },
    statusBoard,
    typeStats,
    recentSubmissions
  };
}

exports.getDashboard = (req, res) => {
  try {
    return res.json({ success: true, data: buildDashboardData() });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getReviewUsers = (req, res) => {
  try {
    const { keyword = '', status = 'all' } = req.query;
    const rows = db.prepare('SELECT * FROM verification_tasks ORDER BY created_at DESC').all();
    const userMap = new Map();

    rows.forEach((task) => {
      const userId = String(task.user_id);
      const list = userMap.get(userId) || [];
      list.push(task);
      userMap.set(userId, list);
    });

    let users = [...userMap.values()].map(buildUserAggregate).filter(Boolean);

    const q = String(keyword || '').trim().toLowerCase();
    if (q) {
      users = users.filter((item) =>
        String(item.nickname || '').toLowerCase().includes(q) ||
        String(item.user_id || '').toLowerCase().includes(q)
      );
    }

    if (status && status !== 'all') {
      users = users.filter((item) => item.overall_status === status);
    }

    users.sort((a, b) => String(b.latest_submitted_at || '').localeCompare(String(a.latest_submitted_at || '')));

    return res.json({ success: true, data: { list: users, total: users.length } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getReviewUserDetail = (req, res) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, message: '缺少 userId' });

    const tasks = getUserTasks(userId);
    if (!tasks.length) return res.status(404).json({ success: false, message: '用户审核记录不存在' });

    const summary = buildUserAggregate(tasks);
    return res.json({ success: true, data: { summary, timeline: tasks } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveReviewItem = (req, res) => {
  try {
    const userId = String(req.params.userId || '').trim();
    const type = String(req.params.type || '').trim();
    const task = getTaskForReview(userId, type);
    if (!task) {
      return res.status(404).json({ success: false, message: '审核项不存在' });
    }
    if (task.status === 'approved') {
      return res.status(400).json({ success: false, message: '该审核项已通过' });
    }

    applyApprove(task, req.admin.id, req.body || {});
    return res.json({ success: true, message: '审核通过' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectReviewItem = (req, res) => {
  try {
    const userId = String(req.params.userId || '').trim();
    const type = String(req.params.type || '').trim();
    const task = getTaskForReview(userId, type);
    if (!task) {
      return res.status(404).json({ success: false, message: '审核项不存在' });
    }

    applyReject(task, req.admin.id, req.body || {});
    return res.json({ success: true, message: '已拒绝' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 兼容旧接口
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

exports.getTaskDetail = (req, res) => {
  const task = db.prepare('SELECT * FROM verification_tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, message: '审核任务不存在' });
  }
  res.json({ success: true, data: normalizeTask(task) });
};

exports.getTaskFileUrl = async (req, res) => {
  try {
    const task = normalizeTask(db.prepare('SELECT * FROM verification_tasks WHERE id = ?').get(req.params.id));
    if (!task) {
      return res.status(404).json({ success: false, message: '审核任务不存在' });
    }

    const preview = getPreviewPayload(task);
    if (!preview) {
      return res.status(404).json({ success: false, message: '未找到认证材料' });
    }

    if (preview.mode === 'public') {
      recordMaterialAccess({
        adminId: req.admin.id,
        taskId: task.id,
        userId: task.user_id,
        type: task.type,
        bucket: '',
        key: preview.url,
        mode: preview.mode,
        ip: req.ip,
        userAgent: req.get('user-agent') || ''
      });
      return res.json({ success: true, data: { url: preview.url, mode: preview.mode } });
    }

    if (!INTERNAL_SERVICE_TOKEN) {
      return res.status(500).json({ success: false, message: 'Missing INTERNAL_SERVICE_TOKEN' });
    }

    const response = await axios.get(`${INTERNAL_API_BASE}/api/internal/oss/private-object-url`, {
      params: {
        bucket: preview.bucket,
        key: preview.key
      },
      headers: {
        'x-internal-token': INTERNAL_SERVICE_TOKEN
      },
      timeout: 10000
    });

    recordMaterialAccess({
      adminId: req.admin.id,
      taskId: task.id,
      userId: task.user_id,
      type: task.type,
      bucket: preview.bucket,
      key: preview.key,
      mode: preview.mode,
      ip: req.ip,
      userAgent: req.get('user-agent') || ''
    });

    return res.json({
      success: true,
      data: {
        url: response.data?.data?.url || '',
        mode: preview.mode,
        key: preview.key,
        filename: preview.filename || ''
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveTask = (req, res) => {
  const task = db.prepare('SELECT * FROM verification_tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, message: '审核任务不存在' });
  }

  if (task.status === 'approved') {
    return res.status(400).json({ success: false, message: '该任务已审核通过，无法再次修改' });
  }

  applyApprove(task, req.admin.id, req.body || {});
  return res.json({ success: true, message: '审核通过' });
};

exports.rejectTask = (req, res) => {
  const task = db.prepare('SELECT * FROM verification_tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ success: false, message: '审核任务不存在' });
  }

  applyReject(task, req.admin.id, req.body || {});
  return res.json({ success: true, message: '已拒绝' });
};

exports.submitTask = (req, res) => {
  const { user_id, nickname, type, bazi_year_pillar, bazi_month_pillar, bazi_day_pillar, bazi_hour_pillar, gender, birth_date, submitted_data } = req.body;

  if (!user_id || !type) {
    return res.status(400).json({ success: false, message: '缺少必要参数' });
  }

  if (type === 'bazi_review') {
    const approved = db
      .prepare("SELECT id FROM verification_tasks WHERE user_id = ? AND type = ? AND status = 'approved' LIMIT 1")
      .get(user_id, type);
    if (approved) {
      return res.status(400).json({ success: false, message: '八字已审核通过，无法重新提交' });
    }
  }

  const existing = db.prepare('SELECT id FROM verification_tasks WHERE user_id = ? AND type = ? AND status = ?').get(user_id, type, 'pending');
  if (existing) {
    db.prepare(`
      UPDATE verification_tasks
      SET bazi_year_pillar = ?, bazi_month_pillar = ?, bazi_day_pillar = ?, bazi_hour_pillar = ?,
          gender = ?, birth_date = ?, submitted_data = ?, nickname = ?, created_at = datetime('now')
      WHERE id = ?
    `).run(
      bazi_year_pillar,
      bazi_month_pillar,
      bazi_day_pillar,
      bazi_hour_pillar,
      gender,
      birth_date,
      JSON.stringify(submitted_data || {}),
      nickname || '',
      existing.id
    );

    return res.json({ success: true, data: { id: existing.id, status: 'pending' } });
  }

  const result = db.prepare(`
    INSERT INTO verification_tasks (user_id, nickname, type, bazi_year_pillar, bazi_month_pillar, bazi_day_pillar, bazi_hour_pillar, gender, birth_date, submitted_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user_id,
    nickname || '',
    type,
    bazi_year_pillar,
    bazi_month_pillar,
    bazi_day_pillar,
    bazi_hour_pillar,
    gender,
    birth_date,
    JSON.stringify(submitted_data || {})
  );

  res.json({ success: true, data: { id: result.lastInsertRowid, status: 'pending' } });
};

exports.getUserReviewStatus = (req, res) => {
  const { user_id } = req.params;
  const tasks = db
    .prepare('SELECT * FROM verification_tasks WHERE user_id = ? ORDER BY created_at DESC')
    .all(user_id);

  const baziTask = pickTaskByPriority(tasks, 'bazi_review');
  const educationTask = pickTaskByPriority(tasks, 'education');
  const companyTask = pickTaskByPriority(tasks, 'company');
  const realNameTask = pickTaskByPriority(tasks, 'real_name');

  const reviewedData = safeParse(baziTask?.reviewed_data);

  const result = {
    bazi_review: baziTask
      ? {
          status: baziTask.status,
          reviewed_data: reviewedData,
          year_pillar: reviewedData?.year_pillar || baziTask.bazi_year_pillar,
          month_pillar: reviewedData?.month_pillar || baziTask.bazi_month_pillar,
          day_pillar: reviewedData?.day_pillar || baziTask.bazi_day_pillar,
          hour_pillar: reviewedData?.hour_pillar || baziTask.bazi_hour_pillar,
          current_luck_pillar:
            reviewedData?.current_luck_pillar || baziTask.current_luck_pillar || '',
          gender: reviewedData?.gender || baziTask.gender
        }
      : null,
    education: educationTask?.status || null,
    company: companyTask?.status || null,
    real_name: realNameTask?.status || null
  };

  res.json({ success: true, data: result });
};

exports.getStats = (req, res) => {
  try {
    return res.json({ success: true, data: buildDashboardData() });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
