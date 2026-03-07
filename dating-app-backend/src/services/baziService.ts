import { BaziInfo } from '../models';
const { Solar, Lunar } = require('lunar-javascript');

// ==============================================
// 1. 基础配置：天干、地支、五行、阴阳、十神
// ==============================================
const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

const GAN_WUXING: Record<string, string> = {
  '甲': '木', '乙': '木',
  '丙': '火', '丁': '火',
  '戊': '土', '己': '土',
  '庚': '金', '辛': '金',
  '壬': '水', '癸': '水'
};

const ZHI_WUXING: Record<string, string> = {
  '子': '水', '丑': '土', '寅': '木', '卯': '木',
  '辰': '土', '巳': '火', '午': '火', '未': '土',
  '申': '金', '酉': '金', '戌': '土', '亥': '水'
};

const GAN_YINYANG: Record<string, string> = {
  '甲': '阳', '乙': '阴', '丙': '阳', '丁': '阴', '戊': '阳',
  '己': '阴', '庚': '阳', '辛': '阴', '壬': '阳', '癸': '阴'
};

// 地支藏干（简化，用于五行统计）
const ZHI_CANG: Record<string, string[]> = {
  '子': ['癸'],
  '丑': ['己', '辛', '癸'],
  '寅': ['甲', '丙', '戊'],
  '卯': ['乙'],
  '辰': ['戊', '乙', '癸'],
  '巳': ['丙', '庚', '戊'],
  '午': ['丁', '己'],
  '未': ['己', '丁', '乙'],
  '申': ['庚', '壬', '戊'],
  '酉': ['辛'],
  '戌': ['戊', '辛', '丁'],
  '亥': ['壬', '甲']
};

// 冲，合
const LIUCHONG = [
  ['子', '午'], ['丑', '未'], ['寅', '申'],
  ['卯', '酉'], ['辰', '戌'], ['巳', '亥']
];
const LIUHE = [
  ['子', '丑'], ['寅', '亥'], ['卯', '戌'],
  ['辰', '酉'], ['巳', '申'], ['午', '未']
];
const SANHE = [
  ['申', '子', '辰'], ['亥', '卯', '未'],
  ['寅', '午', '戌'], ['巳', '酉', '丑']
];

// ==============================================
// 2. 时柱：五鼠遁算法（用户提供的准确算法）
// ==============================================
function getShiZhu(solar: any, riGan: string, hour: number): { shiGan: string; shiZhi: string; shiZhu: string } {
  const SHI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  
  // 计算时支：23:00-01:00为子时，01:00-03:00为丑时，以此类推
  let zhiIdx = Math.floor((hour + 1) / 2) % 12;
  const shiZhi = SHI_ZHI[zhiIdx];

  // 五鼠遁：日干 -> 子时天干
  const WUSHUDUN: Record<string, string> = {
    '甲': '甲', '己': '甲',
    '乙': '丙', '庚': '丙',
    '丙': '戊', '辛': '戊',
    '丁': '庚', '壬': '庚',
    '戊': '壬', '癸': '壬'
  };
  
  const startGan = WUSHUDUN[riGan];
  const startIdx = TIANGAN.indexOf(startGan);
  const shiGan = TIANGAN[(startIdx + zhiIdx) % 10];

  return { shiGan, shiZhi, shiZhu: shiGan + shiZhi };
}

// ==============================================
// 3. 十神
// ==============================================
function getShen(riGan: string, targetGan: string): string {
  const rg = GAN_WUXING[riGan];
  const tg = GAN_WUXING[targetGan];
  const rYang = GAN_YINYANG[riGan] === '阳';
  const tYang = GAN_YINYANG[targetGan] === '阳';
  const same = rYang === tYang;

  if (tg === rg) return same ? '比肩' : '劫财';
  if ((rg === '木' && tg === '火') ||
      (rg === '火' && tg === '土') ||
      (rg === '土' && tg === '金') ||
      (rg === '金' && tg === '水') ||
      (rg === '水' && tg === '木')) {
    return same ? '食神' : '伤官';
  }
  if ((rg === '木' && tg === '土') ||
      (rg === '土' && tg === '水') ||
      (rg === '水' && tg === '火') ||
      (rg === '火' && tg === '金') ||
      (rg === '金' && tg === '木')) {
    return same ? '偏财' : '正财';
  }
  if ((tg === '木' && rg === '火') ||
      (tg === '火' && rg === '土') ||
      (tg === '土' && rg === '金') ||
      (tg === '金' && rg === '水') ||
      (tg === '水' && rg === '木')) {
    return same ? '偏印' : '正印';
  }
  if ((tg === '木' && rg === '土') ||
      (tg === '土' && rg === '水') ||
      (tg === '水' && rg === '火') ||
      (tg === '火' && rg === '金') ||
      (tg === '金' && rg === '木')) {
    return same ? '七杀' : '正官';
  }
  return '?';
}

// ==============================================
// 4. 五行统计（含藏干）
// ==============================================
function countWuxing(gans: string[], zhis: string[]): Record<string, string> {
  const map: Record<string, number> = { mu: 0, huo: 0, tu: 0, jin: 0, shui: 0 };
  const wuxingKey: Record<string, string> = { '木': 'mu', '火': 'huo', '土': 'tu', '金': 'jin', '水': 'shui' };
  for (let g of gans) {
    const w = GAN_WUXING[g];
    if (w && wuxingKey[w]) map[wuxingKey[w]]++;
  }
  for (let z of zhis) {
    const w = ZHI_WUXING[z];
    if (w && wuxingKey[w]) map[wuxingKey[w]]++;
  }
  for (let z of zhis) {
    const cangs = ZHI_CANG[z];
    if (cangs) {
      for (let g of cangs) {
        const w = GAN_WUXING[g];
        if (w && wuxingKey[w]) map[wuxingKey[w]] += 0.5;
      }
    }
  }
    return {
    木: map.mu.toFixed(1),
    火: map.huo.toFixed(1),
    土: map.tu.toFixed(1),
    金: map.jin.toFixed(1),
    水: map.shui.toFixed(1)
  };
}

// ==============================================
// 5. 冲合关系
// ==============================================
function getRelation(zhis: string[]): { 六冲: string[]; 六合: string[]; 三合: string[] } {
  let chong: string[] = [], he: string[] = [], sanhe: string[] = [];
  for (let [a, b] of LIUCHONG) {
    if (zhis.includes(a) && zhis.includes(b)) chong.push(a + '-' + b);
  }
  for (let [a, b] of LIUHE) {
    if (zhis.includes(a) && zhis.includes(b)) he.push(a + '-' + b);
  }
  for (let [a, b, c] of SANHE) {
    if (zhis.includes(a) && zhis.includes(b) && zhis.includes(c)) {
      sanhe.push(a + b + c);
    }
  }
  return { 六冲: chong, 六合: he, 三合: sanhe };
}

// ==============================================
// 6. 旺衰 & 喜用神
// ==============================================
function getXiyong(riGan: string, yueZhi: string): { 旺衰: string; 喜用神: string; 忌神: string } {
  const rg = GAN_WUXING[riGan];
  const yueWu = ZHI_WUXING[yueZhi];
  let wang = false;
  if ((rg === '木' && ['寅', '卯'].includes(yueZhi)) ||
      (rg === '火' && ['巳', '午'].includes(yueZhi)) ||
      (rg === '土' && ['辰', '戌', '丑', '未'].includes(yueZhi)) ||
      (rg === '金' && ['申', '酉'].includes(yueZhi)) ||
      (rg === '水' && ['子', '亥'].includes(yueZhi))) {
    wang = true;
  }
  if (wang) {
    if (rg === '水') return { 旺衰: '身旺', 喜用神: '土，火', 忌神: '金，水' };
    if (rg === '木') return { 旺衰: '身旺', 喜用神: '金，土', 忌神: '水，木' };
    if (rg === '火') return { 旺衰: '身旺', 喜用神: '水，金', 忌神: '木，火' };
    if (rg === '土') return { 旺衰: '身旺', 喜用神: '木，水', 忌神: '火，土' };
    if (rg === '金') return { 旺衰: '身旺', 喜用神: '火，木', 忌神: '土，金' };
  } else {
    if (rg === '水') return { 旺衰: '身弱', 喜用神: '金，水', 忌神: '土，木' };
    if (rg === '木') return { 旺衰: '身弱', 喜用神: '水，木', 忌神: '金，火' };
    if (rg === '火') return { 旺衰: '身弱', 喜用神: '木，火', 忌神: '水，土' };
    if (rg === '土') return { 旺衰: '身弱', 喜用神: '火，土', 忌神: '木，金' };
    if (rg === '金') return { 旺衰: '身弱', 喜用神: '土，金', 忌神: '火，水' };
  }
  return { 旺衰: '未知', 喜用神: '未知', 忌神: '未知' };
}

// ==============================================
// 7. 简单大运
// ==============================================
function getDayun(yueGan: string, yueZhi: string, gender: string, isMan: boolean): string[] {
  const shun = (isMan && ['甲', '丙', '戊', '庚', '壬'].includes(yueGan)) ||
               (!isMan && ['乙', '丁', '己', '辛', '癸'].includes(yueGan));
  let list: string[] = [];
  let idx = TIANGAN.indexOf(yueGan);
  let zidx = DIZHI.indexOf(yueZhi);
  for (let i = 1; i <= 8; i++) {
    if (shun) {
      idx = (idx + 1) % 10;
      zidx = (zidx + 1) % 12;
    } else {
      idx = (idx - 1 + 10) % 10;
      zidx = (zidx - 1 + 12) % 12;
    }
    list.push(TIANGAN[idx] + DIZHI[zidx]);
  }
  return list;
}

// ==============================================
// 8. 主排盘函数（完整输出）
// ==============================================
function calcBazi(year: number, month: number, day: number, hour: number, isMan: boolean = true) {
  // 使用Solar.fromYmdHms来确保时柱计算正确
  const solar = Solar.fromYmdHms(year, month, day, hour, 0, 0);
  const lunar = solar.getLunar();

  const yearGanZhi = lunar.getYearInGanZhi();
  const monthGanZhi = lunar.getMonthInGanZhi();
  const dayGanZhi = lunar.getDayInGanZhi();

  const yearGan = yearGanZhi.charAt(0);
  const yearZhi = yearGanZhi.charAt(1);
  const yueGan = monthGanZhi.charAt(0);
  const yueZhi = monthGanZhi.charAt(1);
  const riGan = dayGanZhi.charAt(0);
  const riZhi = dayGanZhi.charAt(1);

  // 时柱 - 使用lunar-javascript库内置方法（通过Solar.fromYmdHms获取正确的时区时间）
  const shiZhu = lunar.getTimeInGanZhi();
  const shiZhi = shiZhu.charAt(1);

  // 十神
  const nianShen = getShen(riGan, yearGan);
  const yueShen = getShen(riGan, yueGan);
  const shiShen = getShen(riGan, shiZhu.charAt(0));

  // 五行统计
  const wuxing = countWuxing(
    [yearGan, yueGan, riGan, shiZhu.charAt(0)],
    [yearZhi, yueZhi, riZhi, shiZhi]
  );

  // 冲合关系
  const relation = getRelation([yearZhi, yueZhi, riZhi, shiZhi]);

  // 旺衰喜用
  const { 旺衰, 喜用神, 忌神 } = getXiyong(riGan, yueZhi);

  // 大运
  const dayun = getDayun(yueGan, yueZhi, isMan ? '男' : '女', isMan);
  
  return {
    yearPillar: yearGanZhi,
    monthPillar: monthGanZhi,
    dayPillar: dayGanZhi,
    hourPillar: shiZhu,
    dayElement: GAN_WUXING[riGan],
    dayYinYang: GAN_YINYANG[riGan],
    shiShen: {
      yearShiShen: nianShen,
      monthShiShen: yueShen,
      dayShiShen: '日主'
    },
    wuxing,
    relation,
    strength: 旺衰,
    xiyongshen: 喜用神,
    jishen: 忌神,
    daYun: dayun
  };
}

// ==============================================
// 生成命理报告
// ==============================================
function generateBaziReport(bazi: any, gender: string, hourKnown: boolean = true): string {
  const { yearPillar, monthPillar, dayPillar, hourPillar, dayElement, dayYinYang, shiShen, wuxing, relation, strength, xiyongshen, jishen, daYun } = bazi;

  let report = `【八字命盘】\n\n`;
  report += `年柱：${yearPillar}\n`;
  report += `月柱：${monthPillar}\n`;
  report += `日柱：${dayPillar}\n`;
  if (hourPillar) report += `时柱：${hourPillar}\n`;
  report += `\n`;
  
  if (shiShen) {
    report += `【十神】\n`;
    report += `年干十神：${shiShen.yearShiShen}\n`;
    report += `月干十神：${shiShen.monthShiShen}\n`;
    if (hourPillar && shiShen.dayShiShen !== '日主') {
      report += `时干十神：${shiShen.dayShiShen}\n`;
    }
    report += `日主：${dayPillar.charAt(0)}（${dayYinYang}${dayElement}）\n`;
    report += `\n`;
  }
  
  if (daYun && daYun.length > 0) {
    report += `【大运】（${gender === 'male' ? '男' : '女'}）\n`;
    for (let i = 0; i < daYun.length; i++) {
      report += `${8 + i * 10}-${8 + i * 10 + 9}岁: ${daYun[i]}\n`;
    }
    report += `\n`;
  }
  
  report += `【五行】\n`;
  report += `日主：${dayPillar.charAt(0)}（${dayYinYang}${dayElement}）\n`;
  report += `命局：${strength}\n`;
  report += `喜用：${xiyongshen}\n`;
  report += `忌神：${jishen}\n\n`;
  
  report += `【五行分布】\n`;
  const wuxingValues = Object.values(wuxing) as string[];
  const total = wuxingValues.reduce((sum: number, v: string) => sum + parseFloat(v), 0);
  for (const [element, value] of Object.entries(wuxing)) {
    const percent = total > 0 ? Math.round((parseFloat(value as string) / total) * 100) : 0;
    report += `${element}：${value}（${percent}%)\n`;
  }
  report += `\n`;

  if (relation) {
    report += `【冲合关系】\n`;
    if (relation.六冲.length > 0) report += `六冲：${relation.六冲.join(', ')}\n`;
    if (relation.六合.length > 0) report += `六合：${relation.六合.join(', ')}\n`;
    if (relation.三合.length > 0) report += `三合：${relation.三合.join(', ')}\n`;
    if (relation.六冲.length === 0 && relation.六合.length === 0 && relation.三合.length === 0) {
      report += `无明显冲合\n`;
    }
    report += `\n`;
  }
  
  report += `【性格特点】\n`;
  report += getPersonalityTraits(dayElement, strength) + `\n\n`;
  report += `【事业发展】\n`;
  report += getCareerAdvice(xiyongshen) + `\n\n`;
  report += `【感情运势】\n`;
  report += getLoveAdvice(dayElement, gender) + `\n\n`;
  report += `【开运建议】\n`;
  report += getLuckySuggestions(xiyongshen);
  
  return report;
}

function getPersonalityTraits(dayElement: string, strength: string): string {
  const traits: Record<string, string[]> = {
    '木': ['具有生发之气，性格仁慈，有上进心', '有时过于倔强，缺乏灵活性'],
    '火': ['热情开朗，积极主动，充满活力', '有时急躁冲动，缺乏耐心'],
    '土': ['稳重厚道，忠诚可靠，值得信赖', '有时过于保守，缺乏变通'],
    '金': ['刚毅果断，正义感强，有领导力', '有时过于刚硬，不懂变通'],
    '水': ['聪明智慧，灵活变通，适应力强', '有时过于善变，缺乏定性']
  };
  
  const base = traits[dayElement] || traits['木'];
  let result = base[0];
  
  if (strength.includes('旺')) {
    result += '。日主旺盛，意志坚定，行动力强。';
  } else if (strength.includes('弱')) {
    result += '。日主偏弱，需注意培养自信心。';
  } else {
    result += '。性格平和，适中而行。';
  }
  
  return result;
}

function getCareerAdvice(xiyongshen: string): string {
  const careers: Record<string, string> = {
    '木': '适合从事教育、文化、艺术、设计类工作。东方、北方有利。',
    '火': '适合从事能源、电子、餐饮、服务类工作。南方、东方有利。',
    '土': '适合从事房地产、建筑、农业、管理类工作。本地、中原有利。',
    '金': '适合从事金融、法律、医疗、器械类工作。西方、西北有利。',
    '水': '适合从事贸易、物流、咨询、媒体类工作。北方、东方有利。'
  };
  
  const element = xiyongshen.charAt(0);
  return careers[element] || careers['木'];
}

function getLoveAdvice(dayElement: string, gender: string): string {
  const advice: Record<string, string> = {
    '木': '木性温和，对感情专一。2026年红鸾星动，有望遇到正缘。',
    '火': '热情主动，魅力四射。2026年桃花运旺盛，注意烂桃花。',
    '土': '稳重专一，追求稳定。2026年感情稳定，可考虑终身大事。',
    '金': '理性独立，要求较高。2026年需主动出击，不要太被动。',
    '水': '浪漫多情，桃花不断。2026年注意感情专一，避免三角恋。'
  };
  
  return advice[dayElement] || advice['木'];
}

function getLuckySuggestions(xiyongshen: string): string {
  const element = xiyongshen.charAt(0);
  const suggestions: Record<string, string> = {
    '木': '1. 多穿绿色、青色衣服\n2. 使用木质首饰\n3. 家中摆放绿植\n4. 东方位放置文昌塔',
    '火': '1. 多穿红色、紫色衣服\n2. 使用木制品装饰\n3. 摆放孔雀石\n4. 南方位放置照明灯',
    '土': '1. 多穿黄色、棕色衣服\n2. 使用陶瓷器皿\n3. 摆放黄水晶\n4. 中央方位放置泰山石',
    '金': '1. 多穿白色、金色衣服\n2. 使用金属首饰\n3. 摆放白水晶\n4. 西方位放置金属工艺品',
    '水': '1. 多穿黑色、蓝色衣服\n2. 使用水晶制品\n3. 摆放黑曜石\n4. 北方位放置水养植物'
  };
  
  return suggestions[element] || suggestions['木'];
}

// ==============================================
// 导出函数
// ==============================================

export const calculateBazi = async (userId: string, birthDate: Date, gender: string) => {
  return calculateBaziWithBirthData(userId, birthDate, gender, true);
};

export const calculateBaziWithBirthData = async (
  userId: string,
  birthDate: Date,
  gender: string,
  hourKnown: boolean = true
) => {
  try {
    const year = birthDate.getFullYear();
    const month = birthDate.getMonth() + 1;
    const day = birthDate.getDate();
    const hour = birthDate.getHours();
    const minute = birthDate.getMinutes();

    console.log('[Bazi Service] 计算八字:', { year, month, day, hour, minute, hourKnown });

    // 使用 lunar-javascript 库计算八字
    const isMan = gender === 'male';
    const bazi = calcBazi(year, month, day, hour, isMan);

    console.log('[Bazi Service] 八字计算结果:', bazi);

    const report = generateBaziReport(bazi, gender, hourKnown);
    console.log('[Bazi Service] 报告生成完成');

    return {
      id: Date.now(),
      user_id: userId,
      year_pillar: bazi.yearPillar,
      month_pillar: bazi.monthPillar,
      day_pillar: bazi.dayPillar,
      hour_pillar: bazi.hourPillar || '',
      element: bazi.dayElement,
      report: report,
      created_at: new Date(),
      updated_at: new Date()
    };
  } catch (error: any) {
    console.error('八字计算错误:', error);
    throw new Error('八字计算失败: ' + error.message);
  }
};

/**
 * 计算两个人八字的合盘匹配度
 */
export function calculateCompatibility(bazi1: any, bazi2: any): number {
  if (!bazi1 || !bazi2) return 0;
  
  let score = 60;
  
  const parsePillars = (bazi: any) => ({
      year: bazi.year_pillar || '',
      month: bazi.month_pillar || '',
      day: bazi.day_pillar || '',
      hour: bazi.hour_pillar || ''
  });
  
  const p1 = parsePillars(bazi1);
  const p2 = parsePillars(bazi2);
  
  const dayGan1 = p1.day.charAt(0);
  const dayGan2 = p2.day.charAt(0);
  const dayZhi1 = p1.day.charAt(1);
  const dayZhi2 = p2.day.charAt(1);
  
  // 天干五合
  const tianGanHe = ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'];
  const dayGanHe = dayGan1 + dayGan2;
  if (tianGanHe.includes(dayGanHe) || tianGanHe.includes(dayGan2 + dayGan1)) {
    score += 15;
  }
  
  // 地支三合
  const diZhiHe = ['申子辰', '巳酉丑', '寅午戌', '亥卯未'];
  const dayZhiHe = dayZhi1 + dayZhi2;
  for (const he of diZhiHe) {
    if (he.includes(dayZhi1) && he.includes(dayZhi2)) {
      score += 10;
      break;
    }
  }
  
  // 地支相冲
  const diZhiChong = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
  for (const chong of diZhiChong) {
    if (chong.includes(dayZhi1) && chong.includes(dayZhi2)) {
      score -= 10;
      break;
    }
  }
  
  // 年柱相差
  const yearDiff = Math.abs(parseInt(p1.year) - parseInt(p2.year));
  if (yearDiff > 20) score -= 5;
  
  // 五行互补
  const wuxing1 = GAN_WUXING[dayGan1];
  const wuxing2 = GAN_WUXING[dayGan2];

  const xiangSheng = ['木生火', '火生土', '土生金', '金生水', '水生木'];
  const wx1 = wuxing1 + wuxing2;
  const wx2 = wuxing2 + wuxing1;
  if (xiangSheng.includes(wx1) || xiangSheng.includes(wx2)) {
    score += 8;
  }
  
  const xiangKe = ['木克土', '土克水', '水克火', '火克金', '金克木'];
  if (xiangKe.includes(wx1) || xiangKe.includes(wx2)) {
    score -= 5;
  }
  
  return Math.max(0, Math.min(100, score));
}
