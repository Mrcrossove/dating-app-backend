const axios = require('axios');
const { db } = require('../models/database');

const MURRON_URL = process.env.MURRON_API_URL;
const MURRON_KEY = process.env.MURRON_API_KEY;
const CURRENT_DATE = '丙午';
const DAYUN_URL = process.env.DAYUN_API_URL || 'https://www.murron-omni.com/v1/workflows/run';
const DAYUN_KEY = process.env.DAYUN_API_KEY || 'app-OuLMHlENy58k2CUZJdorgKDX';

function buildBaziString(gender, yearPillar, monthPillar, dayPillar, hourPillar) {
  const genderText = gender === 'female' ? '女嘉宾' : '男嘉宾';
  return `${genderText}：年柱：${yearPillar}。月柱：${monthPillar}。日柱：${dayPillar}。时柱：${hourPillar}。`;
}

async function callMurronAPI(inputs, userId) {
  const response = await axios.post(MURRON_URL, {
    inputs,
    response_mode: 'blocking',
    user: userId || 'system'
  }, {
    headers: {
      Authorization: `Bearer ${MURRON_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 120000
  });

  return response.data;
}

async function callDayunAPI(inputs, userId) {
  const response = await axios.post(DAYUN_URL, {
    inputs,
    response_mode: 'blocking',
    user: userId || 'system'
  }, {
    headers: {
      Authorization: `Bearer ${DAYUN_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 120000
  });

  return response.data?.data?.outputs?.res
    || response.data?.outputs?.res
    || response.data?.data?.outputs?.text
    || response.data?.outputs?.text
    || (typeof response.data === 'string' ? response.data : JSON.stringify(response.data));
}

function parseSections(text) {
  const source = String(text || '');
  const sections = {};
  const sectionPatterns = [
    { key: 'characterAnalysis', start: '### 一、', end: '### 二、' },
    { key: 'partnerProfile', start: '### 二、', end: '### 三、' },
    { key: 'compatibility', start: '### 三、', end: '### 四、' },
    { key: 'fortune2026', start: '### 四、', end: null }
  ];

  for (const { key, start, end } of sectionPatterns) {
    const startIdx = source.indexOf(start);
    if (startIdx === -1) continue;
    const endIdx = end ? source.indexOf(end, startIdx) : source.length;
    sections[key] = source.substring(startIdx, endIdx === -1 ? source.length : endIdx).trim();
  }

  const basicIdx = source.indexOf('**【基础信息锁定】**');
  if (basicIdx !== -1) {
    const nextSection = source.indexOf('### 一、', basicIdx);
    sections.basicInfo = source.substring(basicIdx, nextSection === -1 ? source.length : nextSection).trim();
  }

  return sections;
}

function tryParseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const cleaned = value
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
}

function normalizeTextValue(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\\n/g, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePersonalPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  return {
    strong_or_weak: normalizeTextValue(payload.strong_or_weak),
    lucky_elements: normalizeTextValue(payload.lucky_elements),
    unlucky_elements: normalizeTextValue(payload.unlucky_elements),
    title: normalizeTextValue(payload.title),
    social_camouflage: normalizeTextValue(payload.social_camouflage),
    deep_core: normalizeTextValue(payload.deep_core),
    exclusive_verdict: normalizeTextValue(payload.exclusive_verdict),
    partner_profile: normalizeTextValue(payload.partner_profile || payload.partnerProfile),
    fortune_2026: normalizeTextValue(payload.fortune_2026 || payload.fortune2026)
  };
}

function extractPersonalPayload(apiResponse) {
  const outputs = apiResponse?.data?.outputs || apiResponse?.outputs || {};
  const candidates = [
    outputs.json,
    outputs.result,
    outputs.res,
    outputs.text,
    apiResponse?.data,
    apiResponse
  ];

  for (const item of candidates) {
    const parsed = tryParseJson(item);
    const normalized = normalizePersonalPayload(parsed);
    if (normalized && (normalized.strong_or_weak || normalized.title || normalized.social_camouflage)) {
      return {
        payload: normalized,
        rawText: typeof item === 'string' ? item : JSON.stringify(parsed)
      };
    }
  }

  const fallbackText = outputs.text
    || outputs.res
    || outputs.result
    || (typeof apiResponse === 'string' ? apiResponse : JSON.stringify(apiResponse));

  return {
    payload: null,
    rawText: typeof fallbackText === 'string' ? fallbackText : JSON.stringify(fallbackText)
  };
}

function parseCachedPersonalPayload(text) {
  const parsed = tryParseJson(text);
  const normalized = normalizePersonalPayload(parsed);
  return normalized && (normalized.strong_or_weak || normalized.title || normalized.social_camouflage)
    ? normalized
    : null;
}

exports.getPersonalAnalysis = async (req, res) => {
  try {
    const { user_id } = req.body;
    const task = db.prepare("SELECT * FROM verification_tasks WHERE user_id = ? AND type = 'bazi_review' AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1").get(user_id);
    if (!task) {
      return res.status(400).json({ success: false, message: '八字信息尚未审核通过，请等待管理员确认' });
    }

    const finalData = task.reviewed_data ? JSON.parse(task.reviewed_data) : task;
    const yearP = finalData.year_pillar || task.bazi_year_pillar;
    const monthP = finalData.month_pillar || task.bazi_month_pillar;
    const dayP = finalData.day_pillar || task.bazi_day_pillar;
    const hourP = finalData.hour_pillar || task.bazi_hour_pillar;
    const gender = finalData.gender || task.gender;
    const baziString = buildBaziString(gender, yearP, monthP, dayP, hourP);

    const cached = db.prepare("SELECT * FROM murron_cache WHERE user_id = ? AND request_type = 'personal' AND bazi_input = ? ORDER BY created_at DESC LIMIT 1").get(user_id, baziString);
    const cachedPayload = cached ? parseCachedPersonalPayload(cached.response_text) : null;
    if (cached && cachedPayload) {
      return res.json({
        success: true,
        data: {
          ...cachedPayload,
          fullText: cached.response_text,
          bazi: { yearP, monthP, dayP, hourP, gender },
          cached: true
        }
      });
    }

    const apiResult = await callMurronAPI({
      bazi: baziString,
      current_date: CURRENT_DATE
    }, user_id);
    const { payload, rawText } = extractPersonalPayload(apiResult);

    db.prepare('INSERT INTO murron_cache (user_id, request_type, bazi_input, response_text) VALUES (?, ?, ?, ?)').run(
      user_id,
      'personal',
      baziString,
      payload ? JSON.stringify(payload) : rawText
    );

    return res.json({
      success: true,
      data: {
        ...(payload || {}),
        fullText: rawText,
        bazi: { yearP, monthP, dayP, hourP, gender },
        cached: false
      }
    });
  } catch (error) {
    console.error('[Murron] Personal analysis error:', error.message);
    return res.status(500).json({ success: false, message: '命理分析服务暂时不可用，请稍后重试' });
  }
};

exports.getCompatibilityAnalysis = async (req, res) => {
  try {
    const { user_id, target_user_id } = req.body;

    const myTask = db.prepare("SELECT * FROM verification_tasks WHERE user_id = ? AND type = 'bazi_review' AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1").get(user_id);
    const targetTask = db.prepare("SELECT * FROM verification_tasks WHERE user_id = ? AND type = 'bazi_review' AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1").get(target_user_id);

    if (!myTask) {
      return res.status(400).json({ success: false, message: '你的八字信息尚未审核通过' });
    }
    if (!targetTask) {
      return res.status(400).json({ success: false, message: '对方的八字信息尚未审核通过' });
    }

    const myFinal = myTask.reviewed_data ? JSON.parse(myTask.reviewed_data) : myTask;
    const targetFinal = targetTask.reviewed_data ? JSON.parse(targetTask.reviewed_data) : targetTask;

    const myBazi = buildBaziString(
      myFinal.gender || myTask.gender,
      myFinal.year_pillar || myTask.bazi_year_pillar,
      myFinal.month_pillar || myTask.bazi_month_pillar,
      myFinal.day_pillar || myTask.bazi_day_pillar,
      myFinal.hour_pillar || myTask.bazi_hour_pillar
    );

    const targetBazi = buildBaziString(
      targetFinal.gender || targetTask.gender,
      targetFinal.year_pillar || targetTask.bazi_year_pillar,
      targetFinal.month_pillar || targetTask.bazi_month_pillar,
      targetFinal.day_pillar || targetTask.bazi_day_pillar,
      targetFinal.hour_pillar || targetTask.bazi_hour_pillar
    );

    const cacheKey = `${myBazi}||${targetBazi}`;
    const cached = db.prepare("SELECT * FROM murron_cache WHERE user_id = ? AND request_type = 'compatibility' AND bazi_input = ? ORDER BY created_at DESC LIMIT 1").get(user_id, cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: {
          fullText: cached.response_text,
          sections: parseSections(cached.response_text),
          cached: true
        }
      });
    }

    const apiResult = await callMurronAPI({
      bazi: myBazi,
      target_bazi: targetBazi,
      current_date: CURRENT_DATE
    }, user_id);
    const resultText = apiResult?.data?.outputs?.text
      || apiResult?.outputs?.text
      || (typeof apiResult === 'string' ? apiResult : JSON.stringify(apiResult));

    db.prepare('INSERT INTO murron_cache (user_id, request_type, bazi_input, target_bazi_input, response_text) VALUES (?, ?, ?, ?, ?)').run(user_id, 'compatibility', cacheKey, targetBazi, resultText);

    return res.json({
      success: true,
      data: {
        fullText: resultText,
        sections: parseSections(resultText),
        cached: false
      }
    });
  } catch (error) {
    console.error('[Murron] Compatibility error:', error.message);
    return res.status(500).json({ success: false, message: '合盘分析服务暂时不可用，请稍后重试' });
  }
};

exports.getDayunAnalysis = async (req, res) => {
  try {
    const { user_id } = req.body || {};
    if (!user_id) {
      return res.status(400).json({ success: false, message: '缺少 user_id' });
    }

    const task = db.prepare("SELECT * FROM verification_tasks WHERE user_id = ? AND type = 'bazi_review' AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1").get(user_id);
    if (!task) {
      return res.status(400).json({ success: false, message: '八字信息尚未审核通过' });
    }

    const reviewed = task.reviewed_data ? JSON.parse(task.reviewed_data) : {};
    const yearP = reviewed.year_pillar || task.bazi_year_pillar;
    const monthP = reviewed.month_pillar || task.bazi_month_pillar;
    const dayP = reviewed.day_pillar || task.bazi_day_pillar;
    const hourP = reviewed.hour_pillar || task.bazi_hour_pillar;
    const gender = reviewed.gender || task.gender;
    const currentLuckPillar = (reviewed.current_luck_pillar || task.current_luck_pillar || '').trim();

    if (!yearP || !monthP || !dayP || !hourP || !gender) {
      return res.status(400).json({ success: false, message: '审核八字数据不完整' });
    }

    if (!currentLuckPillar) {
      return res.status(400).json({ success: false, message: '当前大运未填写，请管理员先补充 current_luck_pillar' });
    }

    const bazi = `${yearP} ${monthP} ${dayP} ${hourP}`;
    const cacheKey = `${bazi}||${currentLuckPillar}||${gender}`;
    const cached = db.prepare("SELECT * FROM murron_cache WHERE user_id = ? AND request_type = 'dayun' AND bazi_input = ? ORDER BY created_at DESC LIMIT 1").get(user_id, cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: {
          fullText: cached.response_text,
          bazi,
          current_luck_pillar: currentLuckPillar,
          gender,
          cached: true
        }
      });
    }

    const resultText = await callDayunAPI({
      bazi,
      current_luck_pillar: currentLuckPillar,
      gender
    }, user_id);

    db.prepare('INSERT INTO murron_cache (user_id, request_type, bazi_input, response_text) VALUES (?, ?, ?, ?)').run(user_id, 'dayun', cacheKey, resultText);

    return res.json({
      success: true,
      data: {
        fullText: resultText,
        bazi,
        current_luck_pillar: currentLuckPillar,
        gender,
        cached: false
      }
    });
  } catch (error) {
    console.error('[Murron] Dayun analysis error:', error.message);
    return res.status(500).json({ success: false, message: '十年大运分析服务暂时不可用，请稍后重试' });
  }
};
