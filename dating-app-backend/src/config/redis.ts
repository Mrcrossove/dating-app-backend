import Redis from 'ioredis';

let redisAvailable = false;

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: (times) => {
    if (times > 3) {
      console.warn('[Redis] Max retries reached, giving up. Cache will be disabled.');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
  maxRetriesPerRequest: 1,
  lazyConnect: true,
});

redisClient.on('connect', () => {
  redisAvailable = true;
  console.log('[Redis] Connected successfully');
});

redisClient.on('error', (err) => {
  if (redisAvailable) {
    console.error('[Redis] Connection error:', err.message);
  }
  redisAvailable = false;
});

redisClient.connect().catch(() => {
  console.warn('[Redis] Not available, cache features disabled.');
});

// 缓存工具函数
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    try {
      await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      console.error('[Cache] Set error:', err);
    }
  },

  async delete(key: string): Promise<void> {
    try {
      await redisClient.del(key);
    } catch (err) {
      console.error('[Cache] Delete error:', err);
    }
  },

  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err) {
      console.error('[Cache] Delete pattern error:', err);
    }
  },
};

export default redisClient;
