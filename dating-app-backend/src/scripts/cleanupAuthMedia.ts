import 'dotenv/config';
import sequelize from '../config/database';
import { AuthRecord } from '../models';
import { deletePrivateObject, getPrivateOssHosts } from '../services/ossService';

type AuthPayload = {
  authImage?: {
    bucket?: string;
    key?: string;
    mimeType?: string;
    filename?: string;
  } | null;
  authImageDeletedAt?: string;
  authImageCleanupReason?: string;
  [key: string]: any;
};

const DRY_RUN = !['0', 'false', 'no'].includes(String(process.env.CLEANUP_AUTH_MEDIA_DRY_RUN || 'true').toLowerCase());
const LIMIT = Math.max(1, Number.parseInt(String(process.env.CLEANUP_AUTH_MEDIA_LIMIT || '200'), 10) || 200);
const APPROVED_RETENTION_DAYS = Math.max(1, Number.parseInt(String(process.env.AUTH_MEDIA_RETENTION_APPROVED_DAYS || '180'), 10) || 180);
const REJECTED_RETENTION_DAYS = Math.max(1, Number.parseInt(String(process.env.AUTH_MEDIA_RETENTION_REJECTED_DAYS || '30'), 10) || 30);

const safeParse = (text: string | null | undefined): AuthPayload | null => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const main = async () => {
  const { bucket } = getPrivateOssHosts();
  console.log(`[cleanup-auth-media] mode=${DRY_RUN ? 'dry-run' : 'apply'} bucket=${bucket} limit=${LIMIT}`);
  console.log(`[cleanup-auth-media] retention approved=${APPROVED_RETENTION_DAYS}d rejected=${REJECTED_RETENTION_DAYS}d`);

  await sequelize.authenticate();

  const records = await AuthRecord.findAll({
    where: {
      type: ['company', 'education']
    },
    order: [['created_at', 'ASC']],
    limit: LIMIT
  });

  let cleaned = 0;
  let skipped = 0;
  const now = new Date();

  for (const record of records) {
    const payload = safeParse((record as any).payload) || {};
    const authImage = payload.authImage;
    if (!authImage?.bucket || !authImage?.key) {
      skipped += 1;
      continue;
    }
    if (payload.authImageDeletedAt) {
      skipped += 1;
      continue;
    }

    const reviewedAtRaw = (record as any).reviewed_at || (record as any).created_at;
    const reviewedAt = reviewedAtRaw ? new Date(reviewedAtRaw) : null;
    if (!reviewedAt || Number.isNaN(reviewedAt.getTime())) {
      skipped += 1;
      continue;
    }

    const retentionDays = (record as any).status === 'rejected'
      ? REJECTED_RETENTION_DAYS
      : (record as any).status === 'approved'
        ? APPROVED_RETENTION_DAYS
        : 0;
    if (!retentionDays) {
      skipped += 1;
      continue;
    }

    const expiresAt = addDays(reviewedAt, retentionDays);
    if (expiresAt > now) {
      skipped += 1;
      continue;
    }

    if (!DRY_RUN) {
      await deletePrivateObject({
        bucket: authImage.bucket,
        key: authImage.key
      });
      const nextPayload: AuthPayload = {
        ...payload,
        authImageDeletedAt: now.toISOString(),
        authImageCleanupReason: `retention:${(record as any).status}:${retentionDays}d`,
        authImage: null
      };
      (record as any).payload = JSON.stringify(nextPayload);
      await (record as any).save();
    }

    cleaned += 1;
    console.log(`[cleanup-auth-media] ${DRY_RUN ? 'would-clean' : 'cleaned'} user=${(record as any).user_id} type=${(record as any).type} key=${authImage.key}`);
  }

  console.log(`[cleanup-auth-media] cleaned=${cleaned} skipped=${skipped}`);
  await sequelize.close();
};

main().catch(async (error) => {
  console.error('[cleanup-auth-media] failed:', error);
  await sequelize.close().catch(() => undefined);
  process.exit(1);
});
