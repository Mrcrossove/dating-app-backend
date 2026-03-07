import axios from 'axios';

// 使用月之暗面(Moonshot)的API
// API Key 必须从环境变量读取
const API_KEY = process.env.MOONSHOT_API_KEY;
const API_URL = 'https://api.moonshot.cn/v1/chat/completions';

// 验证API Key配置
if (!API_KEY) {
  console.error('[命理服务] MOONSHOT_API_KEY 环境变量未配置');
}

// 模型配置 - 使用月之暗面v1模型
const MODEL = 'moonshot-v1-8k';

/**
 * 使用命理大师API生成详细的命理解读
 */
export async function generateDetailedAnalysis(baziInfo: {
  yearPillar: string;
  monthPillar: string;
  dayPillar: string;
  hourPillar: string;
  dayElement: string;
  dayYinYang: string;
  fiveElements: Record<string, number>;
  xiyongshen: string;
}): Promise<{
  overall: string;
  personality: string;
  career: string;
  wealth: string;
  love: string;
  health: string;
  lucky: string;
  advice: string;
}> {
  const { yearPillar, monthPillar, dayPillar, hourPillar, dayElement, dayYinYang, fiveElements, xiyongshen } = baziInfo;

  // 检查API Key
  if (!API_KEY || API_KEY === '') {
    console.error('[命理服务] 密钥未配置');
    return {
      overall: '抱歉，名师解读服务暂未开通，请联系客服。',
      personality: '',
      career: '',
      wealth: '',
      love: '',
      health: '',
      lucky: '',
      advice: ''
    };
  }

  console.log('[命理服务] 正在为您生成深度命理解读...');

  // 构建提示词 - 更加详细的分析
  const prompt = `你是一位资深的中国八字命理大师，有着30年以上算命经验。请根据以下八字信息生成一份800字左右的深度命理分析报告。

八字排盘：
- 年柱: ${yearPillar}
- 月柱: ${monthPillar}  
- 日柱: ${dayPillar}
- 时柱: ${hourPillar}

日元: ${dayPillar.charAt(0)}（${dayYinYang}${dayElement}）

五行分布：木${fiveElements.木 || 0}% 火${fiveElements.火 || 0}% 土${fiveElements.土 || 0}% 金${fiveElements.金 || 0}% 水${fiveElements.水 || 0}%

喜用神: ${xiyongshen}

请以JSON格式返回以下详细分析（必须严格是有效JSON，不要有markdown标记）：
{
  "overall": "开篇命理总结，80字左右，点明此命整体格局和核心特点",
  "personality": "性格特点详解，100字左右，结合日主和五行分析具体性格",
  "career": "事业发展详解，120字左右，分析适合职业方向、工作运势、贵人方位",
  "wealth": "财运分析详解，100字左右，正偏财分析、理财建议、财库情况",
  "love": "感情运势详解，100字左右，桃花运势、理想伴侣类型、婚姻时机",
  "health": "健康养生建议，80字左右，五行偏颇导致的健康隐患和调理建议",
  "lucky": "幸运元素，60字左右，包含幸运数字、颜色、方位、吉时",
  "advice": "改运建议，80字左右，适合的风水调整、穿戴建议、行为指南"
}

请用专业、温暖、有深度的语气撰写，体现命理大师的智慧和经验。`;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: '你是一位资深的中国八字命理大师，擅长深度命理分析和人生规划指导。请严格按照JSON格式返回数据，不要有markdown代码块标记。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7,
      },
      {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        timeout: 90000, // 90秒超时
      }
    );

    console.log('[命理服务] 深度命理解读生成成功');
    
    if (response.data.choices && response.data.choices.length > 0) {
      const text = response.data.choices[0].message.content;
      // 提取JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          overall: result.overall || '暂无解读',
          personality: result.personality || '暂无解读',
          career: result.career || '暂无解读',
          wealth: result.wealth || '暂无解读',
          love: result.love || '暂无解读',
          health: result.health || '暂无解读',
          lucky: result.lucky || '暂无解读',
          advice: result.advice || '暂无建议'
        };
      }
    }

    return {
      overall: '抱歉，暂时无法生成详细解读，请稍后再试。',
      personality: '',
      career: '',
      wealth: '',
      love: '',
      health: '',
      lucky: '',
      advice: ''
    };
  } catch (error: any) {
    console.error('[命理服务] 深度命理解读生成失败:', error.message);
    return {
      overall: '抱歉，服务暂时繁忙，请稍后再试。',
      personality: '',
      career: '',
      wealth: '',
      love: '',
      health: '',
      lucky: '',
      advice: ''
    };
  }
}

/**
 * 使用命理大师API生成真爱画像
 */
export async function generateSoulmateProfile(baziInfo: {
  yearPillar: string;
  monthPillar: string;
  dayPillar: string;
  hourPillar: string;
  dayElement: string;
  dayYinYang: string;
  fiveElements: Record<string, number>;
  xiyongshen: string;
  gender: string;
}): Promise<{
  overview: string;
  gender: string;
  ageRange: string;
  personality: string[];
  appearance: string;
  occupation: string;
  location: string;
  meetingStyle: string;
  relationshipStyle: string;
  marriageTiming: string;
  advice: string;
  matchScore: number;
}> {
  const { yearPillar, monthPillar, dayPillar, hourPillar, dayElement, dayYinYang, fiveElements, xiyongshen, gender } = baziInfo;

  // 检查API Key
  if (!API_KEY || API_KEY === '') {
    console.error('[命理服务] 密钥未配置');
    return {
      overview: '抱歉，名师解读服务暂未开通',
      gender: '待定',
      ageRange: '待确定',
      personality: ['待确定'],
      appearance: '待确定',
      occupation: '待确定',
      location: '待确定',
      meetingStyle: '待确定',
      relationshipStyle: '待确定',
      marriageTiming: '待确定',
      advice: '请联系客服',
      matchScore: 0
    };
  }

  console.log('[命理服务] 正在为您生成深度真爱画像...');

  // 构建提示词 - 更详细的真爱画像
  const userGender = gender === 'male' ? '男性' : '女性';
  const prompt = `你是一位资深的中国八字合婚专家，有着30年以上牵红线经验。请根据以下八字信息生成一份深度的真爱画像报告。

八字排盘：
- 年柱: ${yearPillar}
- 月柱: ${monthPillar}  
- 日柱: ${dayPillar}
- 时柱: ${hourPillar}

您的性别: ${userGender}
日元: ${dayPillar.charAt(0)}（${dayYinYang}${dayElement}）
五行分布：木${fiveElements.木 || 0}% 火${fiveElements.火 || 0}% 土${fiveElements.土 || 0}% 金${fiveElements.金 || 0}% 水${fiveElements.水 || 0}%
喜用神: ${xiyongshen}

请以JSON格式返回以下详细信息（必须严格是有效JSON，不要有markdown标记）：
{
  "overview": "开篇总结，60字左右，概述正缘特点和这段姻缘的核心",
  "gender": "理想伴侣的性别（男/女）",
  "ageRange": "最佳年龄范围，如：大3-5岁、相差3岁以内",
  "personality": ["性格特点1", "性格特点2", "性格特点3", "性格特点4", "性格特点5"],
  "appearance": "外貌特征描述，50字以内，描述气质和外形特点",
  "occupation": "职业倾向，列出2-3个最适合的职业方向",
  "location": "最可能相遇的地点，列出3-5个具体场所",
  "meetingStyle": "相遇方式，40字左右，描述你们会以什么方式认识",
  "relationshipStyle": "相处模式，50字左右，描述两人在一起的状态",
  "marriageTiming": "结婚时机，预测最佳结婚年份或年龄段",
  "advice": "遇到正缘的建议，60字左右，如何把握这段缘分",
  "matchScore": 匹配度评分(70-99的整数)
}

请用专业、温暖、有深度的语气撰写，体现合婚大师的智慧。`;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: '你是一位资深的中国八字合婚专家，擅长牵红线和服务感情匹配。请严格按照JSON格式返回数据，不要有markdown代码块标记。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      },
      {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        timeout: 90000,
      }
    );

    console.log('[命理服务] 深度真爱画像生成成功');
    
    if (response.data.choices && response.data.choices.length > 0) {
      const text = response.data.choices[0].message.content;
      // 提取JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          overview: result.overview || '暂无分析',
          gender: result.gender || '待定',
          ageRange: result.ageRange || '待确定',
          personality: result.personality || ['待确定'],
          appearance: result.appearance || '待确定',
          occupation: result.occupation || '待确定',
          location: result.location || '待确定',
          meetingStyle: result.meetingStyle || '待确定',
          relationshipStyle: result.relationshipStyle || '待确定',
          marriageTiming: result.marriageTiming || '待确定',
          advice: result.advice || '待确定',
          matchScore: typeof result.matchScore === 'number' ? result.matchScore : 85
        };
      }
    }

    return {
      overview: '暂时无法生成分析',
      gender: '待定',
      ageRange: '待确定',
      personality: ['待确定'],
      appearance: '待确定',
      occupation: '待确定',
      location: '待确定',
      meetingStyle: '待确定',
      relationshipStyle: '待确定',
      marriageTiming: '待确定',
      advice: '请稍后再试',
      matchScore: 0
    };
  } catch (error: any) {
    console.error('[命理服务] 真爱画像生成失败:', error.message);
    return {
      overview: '服务暂时繁忙',
      gender: '待定',
      ageRange: '待确定',
      personality: ['待确定'],
      appearance: '待确定',
      occupation: '待确定',
      location: '待确定',
      meetingStyle: '待确定',
      relationshipStyle: '待确定',
      marriageTiming: '待确定',
      advice: '请稍后再试',
      matchScore: 0
    };
  }
}

/**
 * 使用命理大师API生成运势时间轴
 */
export async function generateFortuneTimeline(baziInfo: {
  yearPillar: string;
  monthPillar: string;
  dayPillar: string;
  hourPillar: string;
  dayElement: string;
  dayYinYang: string;
  fiveElements: Record<string, number>;
  xiyongshen: string;
}): Promise<Array<{
  year: number;
  element: string;
  keyword: string;
  overall: string;
  career: string;
  wealth: string;
  love: string;
  health: string;
  tip: string;
}>> {
  const { yearPillar, monthPillar, dayPillar, hourPillar, dayElement, dayYinYang, fiveElements, xiyongshen } = baziInfo;

  // 检查API Key
  if (!API_KEY || API_KEY === '') {
    console.error('[命理服务] 密钥未配置');
    return [];
  }

  console.log('[命理服务] 正在为您生成深度运势时间轴...');

  const currentYear = new Date().getFullYear();

  // 构建提示词 - 更详细的运势分析
  const prompt = `你是一位资深的中国八字命理大师，有着30年以上流年预测经验。请根据以下八字信息生成未来5年的深度运势时间轴。

八字排盘：
- 年柱: ${yearPillar}
- 月柱: ${monthPillar}  
- 日柱: ${dayPillar}
- 时柱: ${hourPillar}

日元: ${dayPillar.charAt(0)}（${dayYinYang}${dayElement}）
五行分布：木${fiveElements.木 || 0}% 火${fiveElements.火 || 0}% 土${fiveElements.土 || 0}% 金${fiveElements.金 || 0}% 水${fiveElements.水 || 0}%
喜用神: ${xiyongshen}

请以JSON格式返回未来${currentYear}年至${currentYear + 4}年每年运势（必须严格是有效JSON数组，不要有markdown标记）：
[
  {
    "year": ${currentYear},
    "element": "流年天干地支，如：丙午",
    "keyword": "年度核心关键词，如：事业腾飞",
    "overall": "年度整体运势总结，30字左右",
    "career": "事业运势详解，50字左右，工作变动、升职加薪、职业发展",
    "wealth": "财运详解，40字左右，正财偏财、投资理财、收入情况",
    "love": "感情运势，40字左右，桃花情况、婚姻动向、单身建议",
    "health": "健康提醒，30字左右，需要注意的身体健康问题",
    "tip": "开运建议，30字左右，这一年需要注意的事项"
  },
  ...
]

请根据大运、流年、日主关系综合分析每一年运势，用专业精准的语言描述。`;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: '你是一位资深的中国八字命理大师，擅长流年运势预测。请严格按照JSON格式返回数据，不要有markdown代码块标记。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7,
      },
      {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        timeout: 90000,
      }
    );

    console.log('[命理服务] 深度运势时间轴生成成功');
    
    if (response.data.choices && response.data.choices.length > 0) {
      const text = response.data.choices[0].message.content;
      // 提取JSON数组
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return result.map((item: any, index: number) => ({
          year: item.year || currentYear + index,
          element: item.element || '待确定',
          keyword: item.keyword || '待确定',
          overall: item.overall || '暂无分析',
          career: item.career || '暂无分析',
          wealth: item.wealth || '暂无分析',
          love: item.love || '暂无分析',
          health: item.health || '暂无提醒',
          tip: item.tip || '暂无建议'
        }));
      }
    }

    return [];
  } catch (error: any) {
    console.error('[命理服务] 运势时间轴生成失败:', error.message);
    return [];
  }
}
