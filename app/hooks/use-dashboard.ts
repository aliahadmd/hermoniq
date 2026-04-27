import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { CurrencyBalance, ChartData } from '@/lib/types';

const DASHBOARD_BALANCES_KEY = ['dashboard', 'balances'] as const;
const DASHBOARD_CHART_KEY = ['dashboard', 'chart'] as const;

export function useBalances() {
  return useQuery({
    queryKey: DASHBOARD_BALANCES_KEY,
    queryFn: () => apiClient<CurrencyBalance[]>('/api/dashboard/balances'),
  });
}

export function useChartData(from: string, to: string, accountId?: string | null) {
  return useQuery({
    queryKey: [...DASHBOARD_CHART_KEY, from, to, ...(accountId ? [accountId] : [])],
    queryFn: () => {
      let url = `/api/dashboard/chart?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      if (accountId) {
        url += `&accountId=${encodeURIComponent(accountId)}`;
      }
      return apiClient<ChartData[]>(url);
    },
    enabled: !!from && !!to,
  });
}
