import axios from 'axios';

const EASEMOB_HOST = String(process.env.EASEMOB_HOST || 'https://a1.easemob.com').trim().replace(/\/+$/, '');
const EASEMOB_ORG_NAME = String(process.env.EASEMOB_ORG_NAME || '').trim();
const EASEMOB_APP_NAME = String(process.env.EASEMOB_APP_NAME || '').trim();
const EASEMOB_CLIENT_ID = String(process.env.EASEMOB_CLIENT_ID || '').trim();
const EASEMOB_CLIENT_SECRET = String(process.env.EASEMOB_CLIENT_SECRET || '').trim();

let appTokenCache: {
  token: string;
  expireAt: number;
} | null = null;

const ensureConfig = () => {
  const missing = [
    ['EASEMOB_ORG_NAME', EASEMOB_ORG_NAME],
    ['EASEMOB_APP_NAME', EASEMOB_APP_NAME],
    ['EASEMOB_CLIENT_ID', EASEMOB_CLIENT_ID],
    ['EASEMOB_CLIENT_SECRET', EASEMOB_CLIENT_SECRET]
  ].filter((item) => !item[1]).map((item) => item[0]);

  if (missing.length) {
    throw new Error(`Missing EaseMob config: ${missing.join(', ')}`);
  }
};

const getBaseUrl = () => {
  ensureConfig();
  return `${EASEMOB_HOST}/${EASEMOB_ORG_NAME}/${EASEMOB_APP_NAME}`;
};

export const buildImUserId = (userId: string) => {
  const normalized = String(userId || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return `u_${normalized}`;
};

export const getAppToken = async () => {
  ensureConfig();

  if (appTokenCache && appTokenCache.expireAt > Date.now() + 60 * 1000) {
    return appTokenCache.token;
  }

  const res = await axios.post(
    `${getBaseUrl()}/token`,
    {
      grant_type: 'client_credentials',
      client_id: EASEMOB_CLIENT_ID,
      client_secret: EASEMOB_CLIENT_SECRET
    },
    {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  const token = String(res.data?.access_token || '').trim();
  const expiresIn = Number(res.data?.expires_in || 0);

  if (!token) {
    throw new Error('EaseMob app token response missing access_token');
  }

  appTokenCache = {
    token,
    expireAt: Date.now() + Math.max(0, expiresIn) * 1000
  };

  return token;
};

export const getUserToken = async (imUserId: string) => {
  const appToken = await getAppToken();

  const res = await axios.post(
    `${getBaseUrl()}/token`,
    {
      grant_type: 'inherit',
      username: imUserId,
      autoCreateUser: true
    },
    {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appToken}`
      }
    }
  );

  const accessToken = String(res.data?.access_token || '').trim();
  const expiresIn = Number(res.data?.expires_in || 0);

  if (!accessToken) {
    throw new Error('EaseMob user token response missing access_token');
  }

  return {
    imUserId,
    imToken: accessToken,
    expiresIn
  };
};

export const sendTextMessageAsUser = async (params: {
  from: string;
  to: string;
  text: string;
}) => {
  const { from, to, text } = params;
  const appToken = await getAppToken();

  const safeFrom = String(from || '').trim();
  const safeTo = String(to || '').trim();
  const safeText = String(text || '').trim();

  if (!safeFrom || !safeTo || !safeText) {
    throw new Error('Missing EaseMob text message params');
  }

  await Promise.all([
    getUserToken(safeFrom),
    getUserToken(safeTo)
  ]);

  const res = await axios.post(
    `${getBaseUrl()}/messages/users`,
    {
      target_type: 'users',
      target: [safeTo],
      msg: {
        type: 'txt',
        msg: safeText
      },
      from: safeFrom
    },
    {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appToken}`
      }
    }
  );

  return res.data;
};
