import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Transaction } from '@/lib/types';
import type { z } from 'zod';
import type { createTransactionSchema } from '@/lib/validators';

type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

const TRANSACTIONS_KEY = ['transactions'] as const;
const ACCOUNTS_KEY = ['accounts'] as const;
const DASHBOARD_KEY = ['dashboard'] as const;
const BUDGETS_KEY = ['budgets'] as const;

export function useTransactions(enabled = true) {
  return useQuery({
    queryKey: TRANSACTIONS_KEY,
    queryFn: () => apiClient<Transaction[]>('/api/transactions'),
    enabled,
  });
}

export function useFilteredTransactions(from: string, to: string) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, from, to],
    queryFn: () =>
      apiClient<Transaction[]>(
        `/api/transactions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      ),
    enabled: !!from && !!to,
  });
}


export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTransactionInput) =>
      apiClient<Transaction>('/api/transactions', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY });
    },
  });
}
