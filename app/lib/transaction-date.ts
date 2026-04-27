import dayjs from 'dayjs';

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const LEADING_DATE_REGEX = /^(\d{4}-\d{2}-\d{2})(?:$|[Tt\s].*)/;

function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY_REGEX.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

export function extractTransactionDateOnly(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (isValidDateOnly(trimmed)) {
    return trimmed;
  }

  const leadingMatch = LEADING_DATE_REGEX.exec(trimmed);
  if (!leadingMatch) {
    return null;
  }

  return isValidDateOnly(leadingMatch[1]) ? leadingMatch[1] : null;
}

export function getTransactionMonthKey(value: string): string | null {
  const normalized = extractTransactionDateOnly(value);
  return normalized ? normalized.slice(0, 7) : null;
}

export function formatTransactionDateLabel(value: string): string {
  const normalized = extractTransactionDateOnly(value);
  if (normalized) {
    return dayjs(normalized).format('MMM D, YYYY');
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('MMM D, YYYY') : value;
}
