const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', '..', 'admin.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'reviewer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS verification_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      bazi_year_pillar TEXT,
      bazi_month_pillar TEXT,
      bazi_day_pillar TEXT,
      bazi_hour_pillar TEXT,
      current_luck_pillar TEXT,
      gender TEXT,
      birth_date TEXT,
      submitted_data TEXT,
      reviewed_data TEXT,
      reviewer_id INTEGER,
      review_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME,
      FOREIGN KEY (reviewer_id) REFERENCES admin_users(id)
    );

    CREATE TABLE IF NOT EXISTS auth_material_access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      bucket TEXT,
      object_key TEXT,
      access_mode TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admin_users(id)
    );

    CREATE TABLE IF NOT EXISTS murron_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      request_type TEXT NOT NULL,
      bazi_input TEXT NOT NULL,
      target_bazi_input TEXT,
      response_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON verification_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_type ON verification_tasks(type);
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON verification_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_cache_user ON murron_cache(user_id, request_type);
    CREATE INDEX IF NOT EXISTS idx_auth_material_logs_task ON auth_material_access_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_auth_material_logs_admin ON auth_material_access_logs(admin_id);
  `);

  // Add columns for old databases (SQLite has no IF NOT EXISTS for ADD COLUMN on older versions)
  try { db.exec('ALTER TABLE verification_tasks ADD COLUMN current_luck_pillar TEXT'); } catch (_) {}

  const admin = db.prepare('SELECT id FROM admin_users WHERE username = ?').get('admin');
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'super');
    console.log('[DB] Default admin account created: admin / admin123');
  }
}

module.exports = { db, initDatabase };
