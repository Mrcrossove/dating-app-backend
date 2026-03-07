import dotenv from 'dotenv';
import path from 'path';

// Ensure `.env` is loaded no matter where PM2 is started from.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import sequelize from './config/database';
import fs from 'fs';
import * as os from 'os';

const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: isProduction ? undefined : false, // 开发环境禁用CSP
  crossOriginEmbedderPolicy: false, // 允许嵌入资源
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每IP限制100请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: '请求过于频繁，请稍后重试' },
  skip: (req: express.Request) => req.method === 'OPTIONS',
});
app.use('/api/', limiter);

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8081', 'http://localhost:3000'];
app.use(cors({
    origin: isProduction ? allowedOrigins : '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parser limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// Preflight request handling - fixed for Express 5
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
  await sql('ALTER TABLE users ADD COLUMN moments TEXT;');
  await sql('ALTER TABLE users ADD COLUMN wishes TEXT;');
  await sql('ALTER TABLE users ADD COLUMN nickname TEXT;');
};

const ensurePostColumns = async () => {
  const sql = (s: string) => sequelize.query(s).catch(() => undefined);
  await sql('ALTER TABLE posts ADD COLUMN media TEXT;');
};

// Sync database and start server
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');
    
    // In production, use migrations instead of sync({ force: true })
    // force: false ensures tables are created if not exist, but doesn't drop them
    await sequelize.sync({ force: false });
    await ensureUserColumns();
    await ensurePostColumns();
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
