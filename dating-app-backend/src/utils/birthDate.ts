const shanghaiDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const SHANGHAI_OFFSET_HOURS = 8;

const getFormattedParts = (date: Date) => {
  const parts = shanghaiDateTimeFormatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute')
  };
};

const pad2 = (value: string | number) => String(value).padStart(2, '0');

const localBirthDatePattern =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

export const formatBirthDateForDisplay = (value: Date | string | null | undefined) => {
  if (!value) return '';

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '';

    const matched = text.match(localBirthDatePattern);
    if (matched) {
      const [, year, month, day, hour = '12', minute = '00'] = matched;
      return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${minute}`;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const parts = getFormattedParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

export const parseBirthDateInput = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return null;

  const matched = text.match(localBirthDatePattern);
  if (matched) {
    const [, year, month, day, hour = '12', minute = '00', second = '00'] = matched;
    const parsed = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour) - SHANGHAI_OFFSET_HOURS,
        Number(minute),
        Number(second),
        0
      )
    );

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

export const normalizeBirthDateText = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const matched = text.match(localBirthDatePattern);
  if (matched) {
    const [, year, month, day, hour = '12', minute = '00'] = matched;
    return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${minute}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : formatBirthDateForDisplay(parsed);
};
