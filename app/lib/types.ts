export type Currency = 'BDT' | 'USD' | 'RMB';
export type AccountType = 'bank_account' | 'card' | 'cash';
export type TransactionType = 'income' | 'expense';

export interface LinkedAccount {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  date: string;
  description: string;
  categoryId: string | null;
  accountId: string;
  createdAt: string;
  accountName?: string;
  accountCurrency?: Currency;
}

export interface Category {
  id: string;
  title: string;
  details: string;
  color: string;
  icon: string;
}

export interface Profile {
  id: string;
  name: string;
  photoUrl: string | null;
  username: string;
  about: string | null;
  location: string | null;
  gender: string | null;
  website: string | null;
  workCompany: string | null;
  workPosition: string | null;
  workDescription: string | null;
  educationSchool: string | null;
  educationDegree: string | null;
  educationGraduated: boolean | null;
}

export interface CurrencyBalance {
  currency: Currency;
  totalBalance: number;
  accounts: Array<{ id: string; name: string; balance: number }>;
}

export interface ChartData {
  month: string;
  income: number;
  expense: number;
}

export interface MonthlyCategoryBudget {
  id: string;
  month: string;
  limit: number;
  spent: number;
  remaining: number;
  progressPercent: number;
  categoryId: string;
  categoryTitle: string;
  categoryColor: string;
  categoryIcon: string;
  accountId: string;
  accountName: string;
  accountCurrency: Currency;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyBudgetAccountSummary {
  accountId: string;
  accountName: string;
  accountCurrency: Currency;
  totalLimit: number;
  totalSpent: number;
  totalRemaining: number;
  progressPercent: number;
  items: MonthlyCategoryBudget[];
}

export interface MonthlyBudgetSummary {
  month: string;
  accountSummaries: MonthlyBudgetAccountSummary[];
  items: MonthlyCategoryBudget[];
}

export type HabitType = 'yes_no' | 'measurable';
export type HabitFrequency = 'daily' | 'weekdays';
export type HabitListFilter = 'all' | 'due_today' | 'completed_today';
export type HabitInsightsRange = 'week' | 'month' | 'year';
export type HabitWeekStart = 'device' | 'sunday' | 'monday';
export type HabitTimelineDays = 7 | 14 | 30;

export interface HabitPreferences {
  weekStart: HabitWeekStart;
  defaultFilter: HabitListFilter;
  timelineDays: HabitTimelineDays;
  showArchivedByDefault: boolean;
  requireNoteForCompletion: boolean;
  reminderMasterEnabled: boolean;
  defaultReminderEnabled: boolean;
  defaultReminderTime: string | null;
}

export interface Habit {
  id: string;
  userId: string;
  name: string;
  question: string;
  type: HabitType;
  color: string;
  unit: string | null;
  dailyTarget: number | null;
  frequencyType: HabitFrequency;
  frequencyDays: number[];
  reminderEnabled: boolean;
  reminderTime: string | null;
  notes: string;
  startDate: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HabitDayCell {
  date: string;
  weekday: string;
  dayOfMonth: number;
  scheduled: boolean;
  completed: boolean;
  value: number | null;
  note: string;
  hasLog: boolean;
}

export interface HabitListHeader {
  date: string;
  weekday: string;
  dayOfMonth: number;
}

export interface HabitListItem extends Habit {
  progressPercent: number;
  scheduledCount: number;
  completedCount: number;
  dueToday: boolean;
  completedToday: boolean;
  dayCells: HabitDayCell[];
}

export interface HabitListResponse {
  range: {
    from: string;
    to: string;
    days: number;
  };
  filter: HabitListFilter;
  includeArchived: boolean;
  headers: HabitListHeader[];
  items: HabitListItem[];
}

export interface HabitLog {
  id: string;
  habitId: string;
  userId: string;
  logDate: string;
  completed: boolean;
  value: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitOverviewKpi {
  scorePercent: number;
  monthPercent: number;
  yearPercent: number;
  totalCompleted: number;
}

export interface HabitChartPoint {
  label: string;
  date: string;
  value: number;
}

export interface HabitCalendarDay {
  date: string;
  weekday: string;
  dayOfMonth: number;
  scheduled: boolean;
  completed: boolean;
  value: number | null;
  note: string;
  hasLog: boolean;
  isToday: boolean;
}

export interface HabitWeekdayFrequency {
  weekday: string;
  dayIndex: number;
  scheduledCount: number;
  completedCount: number;
  completionRate: number;
}

export interface HabitStreak {
  current: number;
  currentStartDate: string | null;
  currentEndDate: string | null;
  best: number;
  bestStartDate: string | null;
  bestEndDate: string | null;
}

export interface HabitInsights {
  habit: Habit;
  range: HabitInsightsRange;
  overview: HabitOverviewKpi;
  scoreSeries: HabitChartPoint[];
  historySeries: HabitChartPoint[];
  calendar: {
    month: string;
    from: string;
    to: string;
    days: HabitCalendarDay[];
  };
  streak: HabitStreak;
  weekdayFrequency: HabitWeekdayFrequency[];
}

export interface NoteCategory {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  isPinned: boolean;
  archivedAt: string | null;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EventReminderMinutes = 0 | 5 | 10 | 15 | 10080;
export type EventReminderLookaheadDays = 7 | 30 | 90;

export interface EventItem {
  id: string;
  userId: string;
  title: string;
  description: string;
  location: string;
  timezone: string;
  isAllDay: boolean;
  startAt: string;
  endAt: string;
  reminderMinutes: EventReminderMinutes | null;
  source: 'manual' | 'ics';
  externalUid: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportIcsResult {
  createdCount: number;
  updatedCount: number;
  skippedRecurringCount: number;
  skippedInvalidCount: number;
  warnings: string[];
}

export interface AiContexts {
  money: boolean;
  habits: boolean;
  notes: boolean;
  events: boolean;
}

export interface AiChat {
  id: string;
  userId: string;
  title: string;
  customInstruction: string;
  contexts: AiContexts;
  pinned: boolean;
  lastMessagePreview: string;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}

export type AiMessageRole = 'user' | 'assistant' | 'system';

export interface AiMessageAttachment {
  id: string;
  chatId: string;
  messageId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  contentUrl: string;
  createdAt: string;
}

export interface AiMessage {
  id: string;
  role: AiMessageRole;
  content: string;
  createdAt: string;
  attachments?: AiMessageAttachment[];
}

export interface AiNoteActionPayload {
  title: string;
  content: string;
}

export type AiPendingActionType =
  | 'money_create_transaction'
  | 'money_delete_transaction'
  | 'habit_create'
  | 'habit_update'
  | 'habit_log_upsert'
  | 'note_create'
  | 'note_update'
  | 'note_archive'
  | 'event_create'
  | 'event_update'
  | 'event_delete'
  | 'create_note';
export type AiPendingActionStatus = 'pending' | 'confirmed' | 'canceled' | 'expired';
export type AiPendingActionPayload = Record<string, unknown> | null;

export interface AiPendingAction {
  id: string;
  chatId: string;
  userId: string;
  type: AiPendingActionType;
  payload: AiPendingActionPayload;
  status: AiPendingActionStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatMessagesResponse {
  messages: AiMessage[];
  pendingActions: AiPendingAction[];
}

export interface SendAiMessageResponse {
  userMessage: AiMessage;
  assistantMessage: AiMessage;
  pendingAction: AiPendingAction | null;
}

export interface AiChatSearchResult {
  id: string;
  role: AiMessageRole;
  snippet: string;
  createdAt: string;
}

export interface AiStreamStartEvent {
  type: 'start';
  userMessage: AiMessage;
}

export interface AiStreamDeltaEvent {
  type: 'delta';
  text: string;
}

export interface AiStreamActionEvent {
  type: 'action';
  proposedAction: {
    type: AiPendingActionType;
    payload: Record<string, unknown>;
  };
}

export interface AiStreamDoneEvent {
  type: 'done';
  assistantMessage: AiMessage;
  proposedAction: {
    type: AiPendingActionType;
    payload: Record<string, unknown>;
  } | null;
}

export interface AiStreamErrorEvent {
  type: 'error';
  message: string;
}

export type AiStreamEvent =
  | AiStreamStartEvent
  | AiStreamDeltaEvent
  | AiStreamActionEvent
  | AiStreamDoneEvent
  | AiStreamErrorEvent;
