const currencySymbols: Record<string, string> = {
  BDT: '৳',
  USD: '$',
  RMB: '¥',
};

export function getCurrencySymbol(currency?: string | null): string {
  if (!currency) {
    return '';
  }

  return currencySymbols[currency] ?? currency;
}

export function formatMinorUnitAmount(amount: number, currency?: string | null): string {
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${(amount / 100).toFixed(2)}`;
}
