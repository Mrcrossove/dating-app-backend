import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { DataTypes } from 'sequelize';
import routes from './routes';
import sequelize from './config/database';
import fs from 'fs';
import * as os from 'os';

const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

const jwtSecret = process.env.JWT_SECRET || '';
if (!jwtSecret || jwtSecret === 'your_super_secret_key') {
  throw new Error('JWT_SECRET is missing or insecure. Please set a strong JWT_SECRET in environment variables.');
}

app.use(helmet({
  contentSecurityPolicy: isProduction ? undefined : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: express.Request) => {
    const authHeader = String(req.headers.authorization || '').trim();
    if (authHeader.startsWith('Bearer ')) {
      return `token:${authHeader.slice(7, 39)}`;
    }
    return String(req.ip || req.socket.remoteAddress || 'unknown');
  },
  message: { success: false, message: '请求过于频繁，请稍后重试' },
  skip: (req: express.Request) => req.method === 'OPTIONS'
});
app.use('/api/', limiter);

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8081', 'http://localhost:3000'];
app.use(cors({
  origin: isProduction ? allowedOrigins : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use('/uploads', (req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.removeHeader('Cross-Origin-Resource-Policy');
  res.removeHeader('Content-Security-Policy');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use('/uploads', express.static(uploadDir, {
  setHeaders: (res) => {
    res.removeHeader('Cross-Origin-Resource-Policy');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', 'http://localhost:8081');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
    return;
  }
  next();
});

app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url}`);
  next();
});

app.use('/api', routes);

const ensureUserColumns = async () => {
  const sql = (s: string) => sequelize.query(s).catch(() => undefined);
  await sql('DROP TABLE IF EXISTS users_backup;');
  await sql('ALTER TABLE users ADD COLUMN profile_extras TEXT;');
  await sql('ALTER TABLE users ADD COLUMN moments TEXT;');
  await sql('ALTER TABLE users ADD COLUMN wishes TEXT;');
  await sql('ALTER TABLE users ADD COLUMN nickname TEXT;');
  await sql('ALTER TABLE users ADD COLUMN phone TEXT;');
  await sql('ALTER TABLE users ADD COLUMN phone_verified_at DATETIME;');
  await sql('ALTER TABLE users ADD COLUMN profile_completed BOOLEAN DEFAULT 0;');
  await sql('ALTER TABLE users ADD COLUMN last_login_at DATETIME;');
  await sql('ALTER TABLE users ADD COLUMN last_login_ip TEXT;');
  await sql('ALTER TABLE users ADD COLUMN wechat_openid TEXT;');
  await sql('ALTER TABLE users ADD COLUMN wechat_unionid TEXT;');
  await sql('ALTER TABLE users ADD COLUMN im_user_id TEXT;');
};

const ensurePostColumns = async () => {
  const sql = (s: string) => sequelize.query(s).catch(() => undefined);
  await sql('ALTER TABLE posts ADD COLUMN media TEXT;');
  await sql('ALTER TABLE posts ADD COLUMN likes_count INTEGER DEFAULT 0;');
  await sql('ALTER TABLE posts ADD COLUMN views_count INTEGER DEFAULT 0;');
  await sql('ALTER TABLE posts ADD COLUMN comments_count INTEGER DEFAULT 0;');
};

const ensureMatchColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable('matches').catch(() => null);
  if (!table) return;

  const addColumnIfMissing = async (name: string, definition: any) => {
    if (table[name]) return;
    try {
      await queryInterface.addColumn('matches', name, definition);
      console.log(`[DB] matches.${name} added`);
    } catch (error) {
      console.error(`[DB] failed to add matches.${name}:`, error);
    }
  };

  await addColumnIfMissing('female_id', {
    type: DataTypes.TEXT,
    allowNull: true
  });
  await addColumnIfMissing('male_id', {
    type: DataTypes.TEXT,
    allowNull: true
  });
  await addColumnIfMissing('female_question', {
    type: DataTypes.TEXT,
    allowNull: true
  });
  await addColumnIfMissing('male_answer', {
    type: DataTypes.TEXT,
    allowNull: true
  });
  await addColumnIfMissing('question_created_at', {
    type: DataTypes.DATE,
    allowNull: true
  });
  await addColumnIfMissing('answer_created_at', {
    type: DataTypes.DATE,
    allowNull: true
  });
  await addColumnIfMissing('chat_started_at', {
    type: DataTypes.DATE,
    allowNull: true
  });
  await addColumnIfMissing('chat_start_message_sent', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  });
  await addColumnIfMissing('stage', {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: 'matched'
  });
};

const ensureConversationSummaryColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable('conversation_summaries').catch(() => null);
  if (!table) return;

  const addColumnIfMissing = async (name: string, definition: any) => {
    if (table[name]) return;
    try {
      await queryInterface.addColumn('conversation_summaries', name, definition);
      console.log(`[DB] conversation_summaries.${name} added`);
    } catch (error) {
      console.error(`[DB] failed to add conversation_summaries.${name}:`, error);
    }
  };

  await addColumnIfMissing('peer_im_user_id', {
    type: DataTypes.TEXT,
    allowNull: true
  });
  await addColumnIfMissing('chat_type', {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: 'singleChat'
  });
  await addColumnIfMissing('last_message_content', {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: ''
  });
  await addColumnIfMissing('last_message_type', {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: 'text'
  });
  await addColumnIfMissing('last_message_direction', {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: 'send'
  });
  await addColumnIfMissing('last_message_at', {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  });
  await addColumnIfMissing('unread_count', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  });
  await addColumnIfMissing('is_blocked', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  });
};

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    await sequelize.sync({ force: false });
    await ensureUserColumns();
    await ensurePostColumns();
    await ensureMatchColumns();
    await ensureConversationSummaryColumns();
    console.log('Database synced.');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on http://0.0.0.0:${PORT}`);
      console.log(`Local: http://localhost:${PORT}`);
      const networkIps = Object.values(os.networkInterfaces())
        .flat()
        .filter((net) => net && net.family === 'IPv4' && !net.internal)
        .map((net) => net!.address);

      if (networkIps.length) {
        networkIps.forEach((ip) => console.log(`Network: http://${ip}:${PORT}`));
      } else {
        console.log('Network: (no external IPv4 address found)');
      }
    });
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};

startServer();

export default app;
