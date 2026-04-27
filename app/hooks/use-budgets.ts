import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MonthlyBudgetSummary } from '@/lib/types';
import type { z } from 'zod';
import type { createMonthlyBudgetSchema, updateMonthlyBudgetSchema } from '@/lib/validators';

type CreateMonthlyBudgetInput = z.infer<typeof createMonthlyBudgetSchema>;
type UpdateMonthlyBudgetInput = z.infer<typeof updateMonthlyBudgetSchema>;

const BUDGETS_KEY = ['budgets'] as const;
const DASHBOARD_KEY = ['dashboard'] as const;

export function useMonthlyBudgetSummary(month: string, enabled = true) {
  return useQuery({
    queryKey: [...BUDGETS_KEY, month],
    queryFn: () =>
      apiClient<MonthlyBudgetSummary>(`/api/budgets?month=${encodeURIComponent(month)}`),
    enabled: !!month && enabled,
  });
}

export function useCreateMonthlyBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMonthlyBudgetInput) =>
      apiClient('/api/budgets', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useUpdateMonthlyBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMonthlyBudgetInput }) =>
      apiClient(`/api/budgets/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}

export function useDeleteMonthlyBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/api/budgets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
  });
}
