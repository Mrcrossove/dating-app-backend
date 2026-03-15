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
  const response = await axios.post(
    MURRON_URL,
    {
      inputs,
      response_mode: 'blocking',
      user: userId || 'system'
    },
    {
      headers: {
        Authorization: `Bearer ${MURRON_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000
    }
  );

  return response.data;
}

async function callDayunAPI(inputs, userId) {
  const response = await axios.post(
    DAYUN_URL,
    {
      inputs,
      response_mode: 'blocking',
      user: userId || 'system'
    },
    {
      headers: {
        Authorization: `Bearer ${DAYUN_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000
    }
  );

  return response.data;
}

function parseSections(text) {
  const source = String(text || '').trim();
  if (!source) return {};

  const sections = {};
  const sectionPatterns = [
    { key: 'characterAnalysis', start: '### 一、', end: '### 二、' },
    { key: 'partnerProfile', start: '### 二、', end: '### 三、' },
    { key: 'compatibility', start: '### 三、', end: '### 四、' },
    { key: 'fortune2026', start: '### 四、', end: null }
  ];

  sectionPatterns.forEach(({ key, start, end }) => {
    const startIdx = source.indexOf(start);
    if (startIdx === -1) return;
    const endIdx = end ? source.indexOf(end, startIdx) : source.length;
    sections[key] = source.substring(startIdx, endIdx === -1 ? source.length : endIdx).trim();
  });

  if (!sections.compatibility) {
    sections.compatibility = source;
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

function normalizeObjectDeep(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeObjectDeep);
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return normalizeTextValue(value);
  }

  const output = {};
  Object.keys(value).forEach((key) => {
    output[key] = normalizeObjectDeep(value[key]);
  });
  return output;
}

function normalizeLegacyPersonalPayload(payload) {
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

function normalizeStructuredPersonalPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!payload.chapter_1_character_analysis && !payload.chapter_2_partner_profile && !payload.chapter_4_annual_fortune) {
    return null;
  }
  return normalizeObjectDeep(payload);
}

function normalizeStructuredCompatibilityPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!payload.chapter_3_soul_synastry && !payload.score_board && !payload.keywords) {
    return null;
  }
  return normalizeObjectDeep(payload);
}

function normalizeStructuredDayunPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!payload.dazhu_analysis) {
    return null;
  }
  return normalizeObjectDeep(payload);
}

function extractPayload(apiResponse, matcher) {
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
    const matched = matcher(parsed);
    if (matched) {
      return {
        payload: matched,
        rawText: typeof item === 'string' ? item : JSON.stringify(parsed)
      };
    }
  }

  const fallbackText =
    outputs.text ||
    outputs.res ||
    outputs.result ||
    (typeof apiResponse === 'string' ? apiResponse : JSON.stringify(apiResponse));

  return {
    payload: null,
    rawText: typeof fallbackText === 'string' ? fallbackText : JSON.stringify(fallbackText)
  };
}

function extractPersonalPayload(apiResponse) {
  return extractPayload(apiResponse, (parsed) => {
    const structured = normalizeStructuredPersonalPayload(parsed);
    if (structured) return structured;

    const legacy = normalizeLegacyPersonalPayload(parsed);
    if (legacy && (legacy.strong_or_weak || legacy.title || legacy.social_camouflage)) {
      return legacy;
    }
    return null;
  });
}

function extractCompatibilityPayload(apiResponse) {
  return extractPayload(apiResponse, (parsed) => normalizeStructuredCompatibilityPayload(parsed));
}

function extractDayunPayload(apiResponse) {
  return extractPayload(apiResponse, (parsed) => normalizeStructuredDayunPayload(parsed));
}

function parseCachedPersonalPayload(text) {
  const parsed = tryParseJson(text);
  return normalizeStructuredPersonalPayload(parsed) || normalizeLegacyPersonalPayload(parsed);
}

function parseCachedCompatibilityPayload(text) {
  const parsed = tryParseJson(text);
  return normalizeStructuredCompatibilityPayload(parsed);
}

function parseCachedDayunPayload(text) {
  const parsed = tryParseJson(text);
  return normalizeStructuredDayunPayload(parsed);
}

function getApprovedBaziTask(userId) {
  return db
    .prepare(
      "SELECT * FROM verification_tasks WHERE user_id = ? AND type = 'bazi_review' AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1"
    )
    .get(userId);
}

function buildTaskBazi(task) {
  const reviewed = task?.reviewed_data ? JSON.parse(task.reviewed_data) : task || {};
  return {
    gender: reviewed.gender || task.gender || 'male',
    yearP: reviewed.year_pillar || task.bazi_year_pillar || '',
    monthP: reviewed.month_pillar || task.bazi_month_pillar || '',
    dayP: reviewed.day_pillar || task.bazi_day_pillar || '',
    hourP: reviewed.hour_pillar || task.bazi_hour_pillar || ''
  };
}

exports.getPersonalAnalysis = async (req, res) => {
  try {
    const { user_id } = req.body;
    const task = getApprovedBaziTask(user_id);
    if (!task) {
      return res.status(400).json({ success: false, message: '八字信息尚未审核通过，请等待管理员确认' });
    }

    const { gender, yearP, monthP, dayP, hourP } = buildTaskBazi(task);
    const baziString = buildBaziString(gender, yearP, monthP, dayP, hourP);

    const cached = db
      .prepare("SELECT * FROM murron_cache WHERE user_id = ? AND request_type = 'personal' AND bazi_input = ? ORDER BY created_at DESC LIMIT 1")
      .get(user_id, baziString);
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

    const apiResult = await callMurronAPI(
      {
        bazi: baziString,
        current_date: CURRENT_DATE
      },
      user_id
    );
    const { payload, rawText } = extractPersonalPayload(apiResult);

    db.prepare('INSERT INTO murron_cache (user_id, request_type, bazi_input, response_text) VALUES (?, ?, ?, ?)')
      .run(user_id, 'personal', baziString, payload ? JSON.stringify(payload) : rawText);

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
    const { user_id, target_user_id, manual_target_bazi, manual_target_profile } = req.body || {};

    const myTask = getApprovedBaziTask(user_id);
    if (!myTask) {
      return res.status(400).json({ success: false, message: '你的八字信息尚未审核通过' });
    }

    const myBaziData = buildTaskBazi(myTask);
    const myBazi = buildBaziString(
      myBaziData.gender,
      myBaziData.yearP,
      myBaziData.monthP,
      myBaziData.dayP,
      myBaziData.hourP
    );

    let targetBazi = '';
    let targetProfile = null;

    if (manual_target_bazi && typeof manual_target_bazi === 'object') {
      const targetGender = manual_target_bazi.gender || 'male';
      const yearP = manual_target_bazi.year_pillar || '';
      const monthP = manual_target_bazi.month_pillar || '';
      const dayP = manual_target_bazi.day_pillar || '';
      const hourP = manual_target_bazi.hour_pillar || '';

      targetBazi =
        String(manual_target_bazi.bazi_text || '').trim() ||
        buildBaziString(targetGender, yearP, monthP, dayP, hourP);

      targetProfile = {
        mode: 'manual',
        name: String(manual_target_profile?.name || 'TA').trim() || 'TA',
        gender: targetGender,
        day_pillar: dayP,
        birth_date: manual_target_profile?.birth_date || '',
        birth_time: manual_target_profile?.birth_time || '',
        birth_place: manual_target_profile?.birth_place || ''
      };
    } else {
      const targetTask = getApprovedBaziTask(target_user_id);
      if (!targetTask) {
        return res.status(400).json({ success: false, message: '对方的八字信息尚未审核通过' });
      }

      const targetBaziData = buildTaskBazi(targetTask);
      targetBazi = buildBaziString(
        targetBaziData.gender,
        targetBaziData.yearP,
        targetBaziData.monthP,
        targetBaziData.dayP,
        targetBaziData.hourP
      );

      targetProfile = {
        mode: 'user',
        user_id: String(target_user_id || ''),
        gender: targetBaziData.gender,
        day_pillar: targetBaziData.dayP
      };
    }

    const cacheKey = `${myBazi}||${targetBazi}`;
    const cached = db
      .prepare("SELECT * FROM murron_cache WHERE user_id = ? AND request_type = 'compatibility' AND bazi_input = ? ORDER BY created_at DESC LIMIT 1")
      .get(user_id, cacheKey);

    if (cached) {
      return res.json({
        success: true,
        data: {
          fullText: cached.response_text,
          sections: parseSections(cached.response_text),
          compatibility_payload: parseCachedCompatibilityPayload(cached.response_text),
          target_profile: targetProfile,
          cached: true
        }
      });
    }

    const apiResult = await callMurronAPI(
      {
        bazi: myBazi,
        target_bazi: targetBazi,
        current_date: CURRENT_DATE
      },
      user_id
    );
    const { payload, rawText } = extractCompatibilityPayload(apiResult);

    db.prepare(
      'INSERT INTO murron_cache (user_id, request_type, bazi_input, target_bazi_input, response_text) VALUES (?, ?, ?, ?, ?)'
    ).run(user_id, 'compatibility', cacheKey, targetBazi, rawText);

    return res.json({
      success: true,
      data: {
        fullText: rawText,
        sections: parseSections(rawText),
        compatibility_payload: payload,
        target_profile: targetProfile,
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

    const task = getApprovedBaziTask(user_id);
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
      return res.status(400).json({ success: false, message: 'current_luck_pillar 未填写' });
    }

    const bazi = `${yearP} ${monthP} ${dayP} ${hourP}`;
    const workflowBazi = `${yearP}${monthP}${dayP}${hourP}`;
    const workflowGender = gender === 'female' ? '女' : '男';
    const cacheKey = `${workflowBazi}||${currentLuckPillar}||${workflowGender}`;
    const cached = db
      .prepare("SELECT * FROM murron_cache WHERE user_id = ? AND request_type = 'dayun' AND bazi_input = ? ORDER BY created_at DESC LIMIT 1")
      .get(user_id, cacheKey);
    const cachedPayload = cached ? parseCachedDayunPayload(cached.response_text) : null;

    if (cached) {
      return res.json({
        success: true,
        data: {
          fullText: cached.response_text,
          dayun_payload: cachedPayload,
          bazi,
          current_luck_pillar: currentLuckPillar,
          gender,
          cached: true
        }
      });
    }

    const apiResult = await callDayunAPI(
      {
        bazi: workflowBazi,
        current_luck_pillar: currentLuckPillar,
        gender: workflowGender
      },
      user_id
    );
    const { payload, rawText } = extractDayunPayload(apiResult);

    db.prepare('INSERT INTO murron_cache (user_id, request_type, bazi_input, response_text) VALUES (?, ?, ?, ?)')
      .run(user_id, 'dayun', cacheKey, payload ? JSON.stringify(payload) : rawText);

    return res.json({
      success: true,
      data: {
        fullText: rawText,
        dayun_payload: payload,
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
