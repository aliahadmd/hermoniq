/**
 * Parses a user-entered amount string (in whole currency units, e.g. "80.50")
 * and converts it to the smallest currency unit (e.g. cents) by multiplying by 100
 * and rounding to the nearest integer.
 *
 * Returns 0 for invalid, non-numeric, or negative inputs.
 */
export function parseAmountInput(text: string): number {
  const parsed = parseFloat(text);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

const AMOUNT_INPUT_PATTERN = /^\d*(?:\.\d{0,2})?$/;

export function isValidAmountInput(text: string): boolean {
  return AMOUNT_INPUT_PATTERN.test(text.trim());
}

export function formatMinorUnitAmountForInput(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return '';
  }

  return (amount / 100).toFixed(2);
}
