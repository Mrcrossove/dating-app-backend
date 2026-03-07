import crypto from 'crypto';

type OssPolicyOptions = {
  dir: string;
  maxBytes: number;
  expireSeconds?: number;
  contentTypeStartsWith?: string;
};

const getRequiredEnv = (key: string) => {
  const value = (process.env[key] || '').trim();
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
};

const normalizeEndpoint = (raw: string) => {
  const value = raw.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!value) return value;
  if (value.includes('aliyuncs.com')) return value;
  return `${value}.aliyuncs.com`;
};

export const getOssHosts = () => {
  const bucket = getRequiredEnv('OSS_BUCKET');
  const endpoint = normalizeEndpoint(getRequiredEnv('OSS_REGION'));
  const uploadHost = `https://${bucket}.${endpoint}`;

  const cdn = (process.env.OSS_CDN_DOMAIN || '').trim().replace(/\/+$/, '');
  const publicHost = cdn || uploadHost;

  return { bucket, endpoint, uploadHost, publicHost };
};

export const createOssPostPolicy = (options: OssPolicyOptions) => {
  const accessKeyId = getRequiredEnv('OSS_ACCESS_KEY_ID');
  const accessKeySecret = getRequiredEnv('OSS_ACCESS_KEY_SECRET');
  const { uploadHost, publicHost } = getOssHosts();

  const expireSeconds = Math.max(30, Math.min(options.expireSeconds ?? 300, 3600));
  const expireAt = new Date(Date.now() + expireSeconds * 1000).toISOString();

  const conditions: any[] = [
    ['content-length-range', 0, options.maxBytes],
    ['starts-with', '$key', options.dir],
    { 'x-oss-object-acl': 'public-read' }
  ];
  if (options.contentTypeStartsWith) {
    conditions.push(['starts-with', '$Content-Type', options.contentTypeStartsWith]);
  }

  const policyText = JSON.stringify({
    expiration: expireAt,
    conditions
  });

  const policy = Buffer.from(policyText).toString('base64');
  const signature = crypto.createHmac('sha1', accessKeySecret).update(policy).digest('base64');

  return {
    accessId: accessKeyId,
    host: uploadHost,
    publicHost,
    dir: options.dir,
    expire: Math.floor(Date.now() / 1000) + expireSeconds,
    policy,
    signature,
    maxBytes: options.maxBytes
  };
};

