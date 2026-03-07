import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { Op } from 'sequelize';
import { User } from '../models';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3002/api/auth/google/callback';

// WeChat OAuth configuration
const WECHAT_APP_ID = process.env.WECHAT_APP_ID || '';
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || '';

// Generate JWT token with role
const generateToken = (user: any) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );
};

export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password, gender, birthDate, nickname } = req.body;

    const finalUsername = String(username || '').trim();
    const finalNickname = String(nickname || '').trim() || finalUsername;
    const finalEmail =
      String(email || '').trim() ||
      (finalUsername.includes('@') ? finalUsername : `${finalUsername}@local.banhe`);
    const finalBirthDate = birthDate ? new Date(birthDate) : new Date('1995-01-01');

    // Validation (Basic)
    if (!finalUsername || !finalEmail || !password || !gender) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Check if user exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email: finalEmail }, { username: finalUsername }],
      },
    });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      username: finalUsername,
      nickname: finalNickname,
      email: finalEmail,
      password_hash: hashedPassword,
      gender,
      birth_date: finalBirthDate,
    });

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      data: {
        userId: newUser.id,
        token,
        isNewUser: true,
        is_new_user: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          nickname: newUser.nickname,
          email: newUser.email,
          gender: newUser.gender,
          avatar_url: newUser.avatar_url,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, username, password } = req.body;

    if (!password || (!email && !username)) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const user = await User.findOne({ where: email ? { email } : { username } });
    if (!user) {
      return res.status(401).json({ success: false, message: '用户不存在或密码错误' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '用户不存在或密码错误' });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        token,
        isNewUser: false,
        is_new_user: false,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          gender: user.gender,
          avatar_url: user.avatar_url,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Phone-based login/registration for mobile app
export const phoneLogin = async (req: Request, res: Response) => {
  try {
    const { phone, code } = req.body;

    // For demo: accept code "1234" or any 4-digit code
    if (code !== '1234') {
      return res.status(400).json({ success: false, message: '验证码错误' });
    }

    const email = `${phone}@phone.com`;
    let isNewUser = false;
    
    // Check if user exists
    let user = await User.findOne({ where: { email } });
    
    if (!user) {
      isNewUser = true;
      // Auto-register new user
      user = await User.create({
        username: `用户${phone.slice(-4)}`,
        nickname: `用户${phone.slice(-4)}`,
        email,
        password_hash: await bcrypt.hash('password123', 10),
        gender: 'female', // Default, user can change later
        birth_date: new Date('1995-01-01'),
        is_active: true,
      });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        token,
        isNewUser,
        is_new_user: isNewUser,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          gender: user.gender,
          avatar_url: user.avatar_url,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Phone-based registration (separate from login)
export const phoneRegister = async (req: Request, res: Response) => {
  try {
    const { phone, code, gender } = req.body;

    // For demo: accept code "123456" or any 6-digit code
    if (code !== '123456') {
      return res.status(400).json({ success: false, message: '验证码错误' });
    }

    const email = `${phone}@phone.com`;
    
    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ success: false, message: '该手机号已注册，请直接登录' });
    }

    // Create new user
    const newUser = await User.create({
      username: `用户${phone.slice(-4)}`,
      nickname: `用户${phone.slice(-4)}`,
      email,
      password_hash: await bcrypt.hash('password123', 10),
      gender: gender || 'female',
      birth_date: new Date('1995-01-01'),
      is_active: true,
    });

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      data: {
        userId: newUser.id,
        token,
        isNewUser: true,
        is_new_user: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          nickname: newUser.nickname,
          email: newUser.email,
          gender: newUser.gender,
          avatar_url: newUser.avatar_url,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// Google OAuth 登录
// ============================================

// 获取Google授权URL
export const getGoogleAuthUrl = (req: Request, res: Response) => {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];
  
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes.join(' '))}` +
    `&access_type=offline` +
    `&prompt=consent`;
  
  return res.status(200).json({ success: true, data: { url: googleAuthUrl } });
};

// Google OAuth 回调处理
export const googleCallback = async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.redirect(`http://localhost:3001?error=no_code`);
    }

    // 用 code 换取 access_token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const { access_token } = tokenResponse.data;

    // 获取用户信息
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { email, name, picture } = userInfoResponse.data;

    // 查找或创建用户
    let user = await User.findOne({ where: { email } });

    if (!user) {
      // 自动注册新用户
      user = await User.create({
        username: name || email.split('@')[0],
        email,
        password_hash: await bcrypt.hash('google_oauth_' + Date.now(), 10), // 随机密码
        gender: 'female', // 默认，需要用户后续修改
        birth_date: new Date('1995-01-01'),
        is_active: true,
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

    // 重定向回前端，并携带 token
    return res.redirect(`http://localhost:3001?google_token=${token}`);
  } catch (error: any) {
    console.error('Google OAuth Error:', error.message);
    return res.redirect(`http://localhost:3001?error=google_auth_failed`);
  }
};

// 直接使用 Google ID Token 登录（前端获取token后直接提交）
export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { googleToken } = req.body;

    if (!googleToken) {
      return res.status(400).json({ success: false, message: 'Missing Google token' });
    }

    // 验证 Google token
    const ticket = await axios.get(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${googleToken}`);
    
    const { email, name, picture } = ticket.data;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Invalid Google token' });
    }

    // 查找或创建用户
    let user = await User.findOne({ where: { email } });

    if (!user) {
      // 自动注册新用户
      user = await User.create({
        username: name || email.split('@')[0],
        nickname: name || email.split('@')[0],
        email,
        password_hash: await bcrypt.hash('google_oauth_' + Date.now(), 10),
        gender: 'female',
        birth_date: new Date('1995-01-01'),
        is_active: true,
      });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          gender: user.gender,
          avatar_url: user.avatar_url,
        }
      },
    });
  } catch (error: any) {
    console.error('Google Login Error:', error.message);
    return res.status(500).json({ success: false, message: 'Google登录失败: ' + error.message });
  }
};

// ============================================
// WeChat OAuth 登录（移动端原生SDK流程）
// ============================================

// 辅助：通过小程序 jscode2session 获取用户信息，查找或创建本地用户
const exchangeWechatCodeForUser = async (code: string) => {
  // 1. 用 code 换取 openid + unionid（小程序登录流程：jscode2session）
  const sessionRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
    params: {
      appid: WECHAT_APP_ID,
      secret: WECHAT_APP_SECRET,
      js_code: code,
      grant_type: 'authorization_code',
    },
  });

  const { openid, unionid, session_key, errcode, errmsg } = sessionRes.data;

  if (errcode || !openid) {
    console.error('[WeChat jscode2session Error]', { errcode, errmsg, openid });
    throw Object.assign(new Error(errmsg || '微信授权码无效或已过期'), { code: 'WECHAT_TOKEN_FAILED' });
  }

  const identifier = unionid || openid;

  // 2. 查找用户：优先按 provider_id，再按旧版 email 格式兜底
  let user = await User.findOne({ where: { provider_id: identifier, provider: 'wechat' } });

  if (!user) {
    const legacyEmail = openid + '@wechat.com';
    user = await User.findOne({ where: { email: legacyEmail } });
    if (user) {
      await user.update({ provider_id: identifier, provider: 'wechat' });
    }
  }

  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const ts = Date.now().toString(36);
    // 小程序登录默认不返回用户信息，使用占位符，前端可在授权后更新
    user = await User.create({
      username: `微信用户_${ts}`,
      nickname: `微信用户_${ts}`,
      email: `wx_${openid.substring(0, 16)}_${ts}@wechat.com`,
      password_hash: await bcrypt.hash(`wechat_${openid}_${Date.now()}`, 10),
      gender: 'female', // 默认性别，用户后续完善
      birth_date: new Date('1995-01-01'),
      is_active: true,
      provider: 'wechat',
      provider_id: identifier,
      avatar_url: '', // 小程序需要通过前端获取用户信息后更新
    });
  }

  return { user, isNewUser };
};

// 移动端：前端通过微信SDK获取code后直接提交
export const wechatLogin = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: '缺少微信授权码' });
    }

    const { user, isNewUser } = await exchangeWechatCodeForUser(code);
    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        token,
        isNewUser,
        is_new_user: isNewUser,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          gender: user.gender,
          avatar_url: user.avatar_url,
        },
      },
    });
  } catch (error: any) {
    console.error('[WeChat Login Error]', error.message);
    const msg = (error as any).code === 'WECHAT_TOKEN_FAILED'
      ? '微信授权码无效或已过期，请重新授权'
      : '微信登录失败，请稍后重试';
    return res.status(500).json({ success: false, message: msg });
  }
};

// Web端/回调流程：获取WeChat授权URL（用于网页扫码登录或开发调试）
export const getWechatAuthUrl = (req: Request, res: Response) => {
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/wechat/callback`;
  const wechatAuthUrl =
    `https://open.weixin.qq.com/connect/qrconnect?` +
    `appid=${WECHAT_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=snsapi_login` +
    `&state=wechat#wechat_redirect`;

  return res.status(200).json({ success: true, data: { url: wechatAuthUrl } });
};

// Web端回调：微信授权后重定向到此接口，通过深度链接返回APP
export const wechatCallback = async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.redirect('banhe://auth/wechat?error=no_code');
    }

    const { user, isNewUser } = await exchangeWechatCodeForUser(code as string);
    const token = generateToken(user);

    return res.redirect(
      `banhe://auth/wechat?token=${token}&is_new_user=${isNewUser}&user_id=${user.id}`
    );
  } catch (error: any) {
    console.error('[WeChat Callback Error]', error.message);
    return res.redirect('banhe://auth/wechat?error=auth_failed');
  }
};

// ============================================
// 邮箱验证码登录/注册
// ============================================

// 验证码存储（生产环境应使用 Redis）
const emailCodes: Map<string, { code: string; expires: number; gender?: string }> = new Map();

// 发送邮箱验证码
export const sendEmailCode = async (req: Request, res: Response) => {
  try {
    const { email, gender } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: '请输入有效的邮箱地址' });
    }

    // 生成6位验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 存储验证码，5分钟有效
    emailCodes.set(email, { 
      code, 
      expires: Date.now() + 5 * 60 * 1000,
      gender 
    });

    // 实际项目中应该发送邮件，这里模拟发送成功
    // 在控制台打印验证码（演示用）
    console.log(`📧 邮箱验证码: ${email} -> ${code}`);
    
    return res.status(200).json({ 
      success: true, 
      message: '验证码已发送到您的邮箱',
      // 演示模式下返回验证码
      data: { code: process.env.NODE_ENV === 'production' ? undefined : code }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 邮箱验证码登录
export const emailCodeLogin = async (req: Request, res: Response) => {
  try {
    const { email, code, gender } = req.body;

    if (!email || !code) {
      return res.status(400).json({ success: false, message: '请填写邮箱和验证码' });
    }

    // 验证验证码
    const stored = emailCodes.get(email);
    if (!stored) {
      return res.status(400).json({ success: false, message: '请先获取验证码' });
    }

    if (Date.now() > stored.expires) {
      emailCodes.delete(email);
      return res.status(400).json({ success: false, message: '验证码已过期，请重新获取' });
    }

    if (stored.code !== code) {
      return res.status(400).json({ success: false, message: '验证码错误' });
    }

    // 验证码正确，删除已使用的验证码
    emailCodes.delete(email);

    // 查找或创建用户
    let user = await User.findOne({ where: { email } });

    if (!user) {
      // 自动注册新用户
      user = await User.create({
        username: email.split('@')[0],
        nickname: email.split('@')[0],
        email,
        password_hash: await bcrypt.hash('email_code_' + Date.now(), 10),
        gender: gender || stored.gender || 'female',
        birth_date: new Date('1995-01-01'),
        is_active: true,
        is_verified: true,
        provider: 'email',
      });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          gender: user.gender,
          avatar_url: user.avatar_url,
        }
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// 管理员登录
// ============================================

export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email, role: 'admin' } });
    if (!user) {
      return res.status(401).json({ success: false, message: '管理员账号不存在' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '密码错误' });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          role: user.role,
          avatar_url: user.avatar_url,
        }
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
