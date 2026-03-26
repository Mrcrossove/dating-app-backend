const DEFAULT_BLOCKED_WORDS = [
  '微信',
  'vx',
  'v信',
  '加v',
  '约炮',
  '一夜情',
  '嫖娼',
  '包养',
  '裸聊',
  '博彩',
  '赌博',
  '诈骗',
  '毒品'
];

const normalizeText = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '');

const loadBlockedWords = () => {
  const configured = String(process.env.SENSITIVE_WORDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_BLOCKED_WORDS, ...configured]));
};

export const BLOCKED_WORDS = loadBlockedWords();

export const moderateText = (value: unknown) => {
  const original = String(value || '').trim();
  const normalized = normalizeText(original);
  const matchedWords = BLOCKED_WORDS.filter((word) => normalized.includes(normalizeText(word)));

  return {
    original,
    blocked: matchedWords.length > 0,
    matchedWords,
  };
};
