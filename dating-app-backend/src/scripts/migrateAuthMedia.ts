import 'dotenv/config';
import path from 'path';
import { Op } from 'sequelize';
import sequelize from '../config/database';
import { AuthRecord } from '../models';
import { copyObjectToPrivateBucket, getOssHosts, getPrivateOssHosts } from '../services/ossService';

const sqlite3 = require('sqlite3');

type AuthPayload = {
  imageUrl?: string;
  image?: string;
  authImage?: {
    bucket?: string;
    key?: string;
    mimeType?: string;
    filename?: string;
    size?: number;
  } | null;
  [key: string]: any;
};

type AdminTaskRow = {
  id: number;
  submitted_data: string;
};

type MigrationResult =
  | { migrated: false; reason: string }
  | { migrated: true; userId: string; type: string; imageUrl: string; destinationKey: string; nextPayload: AuthPayload };

const DRY_RUN = !['0', 'false', 'no'].includes(String(process.env.MIGRATE_AUTH_MEDIA_DRY_RUN || 'true').toLowerCase());
const LIMIT = Math.max(1, Number.parseInt(String(process.env.MIGRATE_AUTH_MEDIA_LIMIT || '200'), 10) || 200);
const ADMIN_DB_PATH = process.env.ADMIN_DB_PATH
  ? path.resolve(process.env.ADMIN_DB_PATH)
  : path.resolve(__dirname, '../../../admin-backend/admin.db');

const SOURCE_CDN_HOSTS = new Set(
  [process.env.OSS_CDN_DOMAIN, process.env.API_DOMAIN, process.env.PUBLIC_BASE_URL]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => value.replace(/^https?:\/\//, '').replace(/\/+$/, ''))
);

const safeParse = (text: string | null | undefined): AuthPayload | null => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
};

const openAdminDb = () => new sqlite3.Database(ADMIN_DB_PATH);

const allAsync = <T = any>(db: any, sql: string, params: any[] = []) =>
  new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

const runAsync = (db: any, sql: string, params: any[] = []) =>
  new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

const inferMimeType = (key: string) => {
  const lower = key.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
};

const resolveSourceLocation = (rawUrl: string) => {
  const url = new URL(rawUrl);
  const hostname = url.hostname.toLowerCase();
  const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!pathname) return null;

  const { bucket: defaultBucket } = getOssHosts();
  const ossMatch = hostname.match(/^([^.]+)\.oss-[^.]+\.aliyuncs\.com$/);
  if (ossMatch) {
    return {
      sourceBucket: ossMatch[1],
      sourceKey: pathname
    };
  }

  if (SOURCE_CDN_HOSTS.has(hostname)) {
    return {
      sourceBucket: defaultBucket,
      sourceKey: pathname
    };
  }

  return null;
};

const buildDestinationKey = (type: string, userId: string, sourceKey: string) => {
  const ext = path.extname(sourceKey) || '.jpg';
  const fileBase = path.basename(sourceKey, ext);
  const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  return `auth/${type}/${userId}/migrated/${datePath}/${fileBase}${ext}`;
};

const migrateAuthRecordPayload = async (record: any): Promise<MigrationResult> => {
  const payload = safeParse(record.payload) || {};
  if (payload.authImage?.bucket && payload.authImage?.key) {
    return { migrated: false, reason: 'already-private' };
  }

  const imageUrl = String(payload.imageUrl || payload.image || '').trim();
  if (!imageUrl) {
    return { migrated: false, reason: 'missing-imageUrl' };
  }

  const source = resolveSourceLocation(imageUrl);
  if (!source) {
    return { migrated: false, reason: 'unsupported-imageUrl' };
  }

  const destinationKey = buildDestinationKey(record.type, record.user_id, source.sourceKey);
  const copied = await copyObjectToPrivateBucket({
    sourceBucket: source.sourceBucket,
    sourceKey: source.sourceKey,
    destinationKey
  });

  const nextPayload: AuthPayload = {
    ...payload,
    legacyImageUrl: payload.legacyImageUrl || imageUrl,
    authImage: {
      bucket: copied.bucket,
      key: copied.key,
      mimeType: inferMimeType(copied.key),
      filename: path.basename(copied.key)
    }
  };

  if (!DRY_RUN) {
    record.payload = JSON.stringify(nextPayload);
    await record.save();
  }

  return {
    migrated: true,
    userId: record.user_id,
    type: record.type,
    imageUrl,
    destinationKey,
    nextPayload
  };
};

const migrateAdminTasks = async (db: any, migratedPayloads: AuthPayload[]) => {
  const rows = await allAsync<AdminTaskRow>(
    db,
    `SELECT id, submitted_data
     FROM verification_tasks
     WHERE type IN ('company', 'education')
     ORDER BY created_at DESC`
  );

  let updated = 0;
  for (const row of rows) {
    const payload = safeParse(row.submitted_data);
    if (!payload) continue;
    if (payload.authImage?.bucket && payload.authImage?.key) continue;

    const imageUrl = String(payload.imageUrl || payload.image || '').trim();
    if (!imageUrl) continue;

    const matched = migratedPayloads.find(
      (item) => String(item.legacyImageUrl || item.imageUrl || item.image || '').trim() === imageUrl &&
        item.authImage?.bucket && item.authImage?.key
    );
    if (!matched) continue;

    const nextPayload = {
      ...payload,
      legacyImageUrl: payload.legacyImageUrl || imageUrl,
      authImage: matched.authImage
    };

    if (!DRY_RUN) {
      await runAsync(
        db,
        'UPDATE verification_tasks SET submitted_data = ? WHERE id = ?',
        [JSON.stringify(nextPayload), row.id]
      );
    }
    updated += 1;
  }

  return updated;
};

const main = async () => {
  const { bucket: publicBucket } = getOssHosts();
  const { bucket: privateBucket } = getPrivateOssHosts();
  console.log(`[migrate-auth-media] mode=${DRY_RUN ? 'dry-run' : 'apply'} public=${publicBucket} private=${privateBucket} limit=${LIMIT}`);

  await sequelize.authenticate();

  const records = await AuthRecord.findAll({
    where: {
      type: { [Op.in]: ['company', 'education'] },
      payload: { [Op.ne]: '{}' }
    },
    order: [['created_at', 'DESC']],
    limit: LIMIT
  });

  const migratedPayloads: AuthPayload[] = [];
  let migratedCount = 0;
  const skipped: Record<string, number> = {};

  for (const record of records) {
    const result = await migrateAuthRecordPayload(record);
    if (result.migrated) {
      migratedCount += 1;
      migratedPayloads.push(result.nextPayload);
      console.log(`[migrate-auth-media] ${DRY_RUN ? 'would-migrate' : 'migrated'} user=${(record as any).user_id} type=${(record as any).type} -> ${result.destinationKey}`);
    } else {
      skipped[result.reason] = (skipped[result.reason] || 0) + 1;
    }
  }

  const adminDb = openAdminDb();
  try {
    const adminUpdated = await migrateAdminTasks(adminDb, migratedPayloads);
    console.log(`[migrate-auth-media] ${DRY_RUN ? 'would-update' : 'updated'} admin tasks=${adminUpdated}`);
  } finally {
    adminDb.close();
  }

  console.log(`[migrate-auth-media] auth_records migrated=${migratedCount}`);
  Object.entries(skipped).forEach(([reason, count]) => {
    console.log(`[migrate-auth-media] skipped ${reason}=${count}`);
  });
  await sequelize.close();
};

main().catch(async (error) => {
  console.error('[migrate-auth-media] failed:', error);
  await sequelize.close().catch(() => undefined);
  process.exit(1);
});
