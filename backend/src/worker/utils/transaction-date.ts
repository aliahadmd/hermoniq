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

export function extractDateOnly(value: string): string | null {
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

export function normalizeTransactionDateInput(value: string): string {
  const normalized = extractDateOnly(value);
  if (!normalized) {
    throw new Error("Invalid transaction date. Expected YYYY-MM-DD.");
  }

  return normalized;
}

export function normalizeTransactionDateQuery(value?: string | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return extractDateOnly(value);
}
