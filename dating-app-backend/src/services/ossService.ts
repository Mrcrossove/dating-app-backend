import crypto from 'crypto';

type OssPolicyOptions = {
  dir: string;
  maxBytes: number;
  expireSeconds?: number;
  contentTypeStartsWith?: string;
  bucketEnvKey?: 'OSS_BUCKET' | 'OSS_PRIVATE_BUCKET';
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

export const getPrivateOssHosts = () => {
  const bucket = getRequiredEnv('OSS_PRIVATE_BUCKET');
  const endpoint = normalizeEndpoint(process.env.OSS_PRIVATE_REGION || getRequiredEnv('OSS_REGION'));
  const uploadHost = `https://${bucket}.${endpoint}`;

  return { bucket, endpoint, uploadHost, publicHost: uploadHost };
};

export const createOssPostPolicy = (options: OssPolicyOptions) => {
  const accessKeyId = getRequiredEnv('OSS_ACCESS_KEY_ID');
  const accessKeySecret = getRequiredEnv('OSS_ACCESS_KEY_SECRET');
  const { uploadHost, publicHost, bucket } = options.bucketEnvKey === 'OSS_PRIVATE_BUCKET'
    ? getPrivateOssHosts()
    : getOssHosts();

  const expireSeconds = Math.max(30, Math.min(options.expireSeconds ?? 300, 3600));
  const expireAt = new Date(Date.now() + expireSeconds * 1000).toISOString();

  const conditions: any[] = [
    ['content-length-range', 0, options.maxBytes],
    ['starts-with', '$key', options.dir]
  ];
  if (options.bucketEnvKey !== 'OSS_PRIVATE_BUCKET') {
    conditions.push({ 'x-oss-object-acl': 'public-read' });
  }
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
    bucket,
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

const encodeObjectKey = (key: string) =>
  String(key || '')
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

export const createPrivateObjectSignedUrl = (params: {
  bucket?: string;
  key: string;
  expiresSeconds?: number;
}) => {
  const accessKeyId = getRequiredEnv('OSS_ACCESS_KEY_ID');
  const accessKeySecret = getRequiredEnv('OSS_ACCESS_KEY_SECRET');
  const { bucket: defaultBucket, endpoint } = getPrivateOssHosts();
  const bucket = String(params.bucket || defaultBucket).trim();
  const key = String(params.key || '').trim().replace(/^\/+/, '');
  if (!bucket) throw new Error('Missing private bucket');
  if (!key) throw new Error('Missing object key');

  const expires = Math.floor(Date.now() / 1000) + Math.max(30, Math.min(params.expiresSeconds ?? 300, 3600));
  const canonicalResource = `/${bucket}/${key}`;
  const stringToSign = `GET\n\n\n${expires}\n${canonicalResource}`;
  const signature = crypto.createHmac('sha1', accessKeySecret).update(stringToSign).digest('base64');
  const encodedKey = encodeObjectKey(key);
  const query = new URLSearchParams({
    OSSAccessKeyId: accessKeyId,
    Expires: String(expires),
    Signature: signature
  });

  return `https://${bucket}.${endpoint}/${encodedKey}?${query.toString()}`;
};

const buildCanonicalizedOssHeaders = (headers: Record<string, string>) =>
  Object.keys(headers)
    .reduce<Record<string, string>>((acc, key) => {
      acc[key.toLowerCase()] = headers[key];
      return acc;
    }, {});

const stringifyCanonicalizedOssHeaders = (headers: Record<string, string>) =>
  Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}`)
    .join('\n');

const buildOssAuthorization = (params: {
  method: 'PUT' | 'GET' | 'HEAD' | 'DELETE';
  bucket: string;
  key: string;
  date: string;
  ossHeaders?: Record<string, string>;
  contentMd5?: string;
  contentType?: string;
}) => {
  const accessKeyId = getRequiredEnv('OSS_ACCESS_KEY_ID');
  const accessKeySecret = getRequiredEnv('OSS_ACCESS_KEY_SECRET');
  const canonicalizedHeaders = stringifyCanonicalizedOssHeaders(buildCanonicalizedOssHeaders(params.ossHeaders || {}));
  const canonicalizedResource = `/${params.bucket}/${params.key}`;
  const stringToSign = [
    params.method,
    params.contentMd5 || '',
    params.contentType || '',
    params.date,
    canonicalizedHeaders ? `${canonicalizedHeaders}\n${canonicalizedResource}` : canonicalizedResource
  ].join('\n');
  const signature = crypto.createHmac('sha1', accessKeySecret).update(stringToSign).digest('base64');
  return `OSS ${accessKeyId}:${signature}`;
};

export const copyObjectToPrivateBucket = async (params: {
  sourceBucket: string;
  sourceKey: string;
  destinationKey: string;
}) => {
  const { bucket: destinationBucket, endpoint } = getPrivateOssHosts();
  const sourceBucket = String(params.sourceBucket || '').trim();
  const sourceKey = String(params.sourceKey || '').trim().replace(/^\/+/, '');
  const destinationKey = String(params.destinationKey || '').trim().replace(/^\/+/, '');
  if (!sourceBucket || !sourceKey || !destinationKey) {
    throw new Error('Missing source or destination for OSS copy');
  }

  const encodedSourceKey = sourceKey
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const copySource = `/${sourceBucket}/${encodedSourceKey}`;
  const date = new Date().toUTCString();
  const ossHeaders = {
    'x-oss-copy-source': copySource
  };
  const authorization = buildOssAuthorization({
    method: 'PUT',
    bucket: destinationBucket,
    key: destinationKey,
    date,
    ossHeaders
  });

  const response = await fetch(`https://${destinationBucket}.${endpoint}/${encodeObjectKey(destinationKey)}`, {
    method: 'PUT',
    headers: {
      Date: date,
      Authorization: authorization,
      'x-oss-copy-source': copySource
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OSS copy failed (${response.status}): ${text}`);
  }

  return {
    bucket: destinationBucket,
    key: destinationKey
  };
};

export const deletePrivateObject = async (params: {
  bucket?: string;
  key: string;
}) => {
  const { bucket: defaultBucket, endpoint } = getPrivateOssHosts();
  const bucket = String(params.bucket || defaultBucket).trim();
  const key = String(params.key || '').trim().replace(/^\/+/, '');
  if (!bucket || !key) {
    throw new Error('Missing private object location');
  }

  const date = new Date().toUTCString();
  const authorization = buildOssAuthorization({
    method: 'DELETE',
    bucket,
    key,
    date
  });

  const response = await fetch(`https://${bucket}.${endpoint}/${encodeObjectKey(key)}`, {
    method: 'DELETE',
    headers: {
      Date: date,
      Authorization: authorization
    }
  });

  if (response.status === 404 || response.status === 204) {
    return { deleted: true };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OSS delete failed (${response.status}): ${text}`);
  }

  return { deleted: true };
};

