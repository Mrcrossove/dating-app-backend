import { Sequelize } from 'sequelize';
import path from 'path';

// 临时使用 SQLite 进行本地开发测试
// 生产环境请切换到 PostgreSQL
const parseBool = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
};

const parseIntOr = (value: string | undefined, defaultValue: number) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : defaultValue;
};

const nodeEnv = process.env.NODE_ENV || 'development';
const logging =
  parseBool(process.env.DB_LOGGING, nodeEnv === 'development') ? console.log : false;

const pool = {
  max: parseIntOr(process.env.DB_POOL_MAX, 10),
  min: parseIntOr(process.env.DB_POOL_MIN, 0),
};

const databaseUrl = process.env.DATABASE_URL?.trim();
const hasPgVars =
  !!process.env.DB_HOST ||
  !!process.env.DB_NAME ||
  !!process.env.DB_USER ||
  !!process.env.DB_PASSWORD;

const shouldUsePostgres =
  process.env.DB_DIALECT?.toLowerCase() === 'postgres' ||
  process.env.DB_DIALECT?.toLowerCase() === 'postgresql' ||
  !!databaseUrl ||
  (nodeEnv === 'production' && hasPgVars);

let sequelize: Sequelize;

if (shouldUsePostgres) {
  const dialectOptions = parseBool(process.env.DB_SSL, false)
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : undefined;

  sequelize = databaseUrl
    ? new Sequelize(databaseUrl, {
        dialect: 'postgres',
        pool,
        logging,
        dialectOptions,
      })
    : new Sequelize({
        dialect: 'postgres',
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseIntOr(process.env.DB_PORT, 5432),
        database: process.env.DB_NAME || 'dating_app',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        pool,
        logging,
        dialectOptions,
      });
} else {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../../database.sqlite'),
    pool,
    logging,
  });
}

export default sequelize;
