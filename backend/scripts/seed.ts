/**
 * Full seed script for Harmoniq backend.
 *
 * What it seeds:
 * - Admin user + profile
 * - Categories
 * - Accounts
 * - Transactions (idempotent)
 * - Monthly budgets (account+category)
 * - Habit preferences
 * - Habits + habit logs
 * - Notes + note categories
 * - Planner events
 * - AI chat presets
 *
 * Prerequisites:
 * 1. Apply latest migrations locally:
 *    npx wrangler d1 migrations apply harmoniq-db --local
 * 2. Run backend dev server:
 *    npm run dev
 *
 * Run:
 *    npm run seed
 */

const BASE = process.env.SEED_BASE_URL ?? "http://localhost:5173";
const API = `${BASE}/api`;
const DB_NAME = process.env.SEED_DB_NAME ?? "harmoniq-db";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin@123";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Admin";
const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? "admin_seed";
const args = new Set(process.argv.slice(2));

let sessionCookie = "";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type HabitType = "yes_no" | "measurable";
type HabitFrequencyType = "daily" | "weekdays";
type HabitListFilter = "all" | "due_today" | "completed_today";
type Currency = "BDT" | "USD" | "RMB";
type AccountType = "bank_account" | "card" | "cash";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  authPath?: boolean;
  allowStatuses?: number[];
}

interface RequestResult<T> {
  status: number;
  data: T;
}

interface Category {
  id: string;
  title: string;
}

interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
}

interface Transaction {
  id: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  description: string;
  categoryId: string | null;
  accountId: string;
}

interface BudgetItem {
  id: string;
  month: string;
  limit: number;
  categoryId: string;
  accountId: string;
}

interface BudgetResponse {
  month: string;
  items: BudgetItem[];
}

interface HabitListItem {
  id: string;
  name: string;
  archivedAt: string | null;
}

interface HabitListResponse {
  filter: HabitListFilter;
  includeArchived: boolean;
  items: HabitListItem[];
}

interface Habit {
  id: string;
  name: string;
  archivedAt: string | null;
}

interface NoteCategory {
  id: string;
  name: string;
}

interface Note {
  id: string;
  title: string;
  isPinned: boolean;
  archivedAt: string | null;
  categoryId: string | null;
}

interface EventItem {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
}

interface AiChat {
  id: string;
  title: string;
  pinned: boolean;
}

interface SeedTransactionDef {
  amount: number;
  type: "income" | "expense";
  date: string;
  description: string;
  categoryTitle: string;
  accountName: string;
}

interface SeedBudgetDef {
  categoryTitle: string;
  accountName: string;
  limit: number;
}

interface SeedHabitLogDef {
  date: string;
  completed?: boolean;
  value?: number;
  note?: string;
}

interface SeedHabitDef {
  name: string;
  question: string;
  type: HabitType;
  color: string;
  unit: string | null;
  dailyTarget: number | null;
  frequencyType: HabitFrequencyType;
  frequencyDays: number[];
  reminderEnabled: boolean;
  reminderTime: string | null;
  notes: string;
  startDate: string;
  logs: SeedHabitLogDef[];
}

interface SeedNoteDef {
  title: string;
  content: string;
  categoryName: string;
  pinned?: boolean;
  archived?: boolean;
}

interface SeedEventDef {
  title: string;
  description: string;
  location: string;
  timezone: string;
  isAllDay: boolean;
  startAt: string;
  endAt: string;
  reminderMinutes: 0 | 5 | 10 | 15 | 10080 | null;
}

interface SeedAiChatDef {
  title: string;
  customInstruction: string;
  pinned?: boolean;
}

function parseJsonMaybe(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function captureCookies(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  let setCookies: string[] = [];
  if (typeof headers.getSetCookie === "function") {
    setCookies = headers.getSetCookie();
  } else {
    const raw = response.headers.get("set-cookie");
    if (raw) setCookies = raw.split(/,(?=\s*\w+=)/);
  }

  if (setCookies.length === 0) return;
  sessionCookie = setCookies
    .map((cookie) => cookie.split(";")[0].trim())
    .join("; ");
}

function stringifyData(data: unknown): string {
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<RequestResult<T>> {
  const {
    method = "GET",
    body,
    authPath = false,
    allowStatuses = [200, 201],
  } = options;
  const url = `${authPath ? BASE : API}${path}`;
  const headers: Record<string, string> = {};

  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (sessionCookie) headers.Cookie = sessionCookie;
  if (authPath) headers.Origin = BASE;

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });

  captureCookies(response);
  const rawText = await response.text();
  const data = parseJsonMaybe(rawText) as T;

  if (!allowStatuses.includes(response.status)) {
    throw new Error(
      `${method} ${path} failed (${response.status}): ${stringifyData(data)}`,
    );
  }

  return { status: response.status, data };
}

async function apiGet<T>(path: string): Promise<T> {
  const result = await request<T>(path, { method: "GET", allowStatuses: [200] });
  return result.data;
}

async function apiPost<T>(path: string, body: unknown, allowStatuses = [200, 201]): Promise<T> {
  const result = await request<T>(path, { method: "POST", body, allowStatuses });
  return result.data;
}

async function apiPut<T>(path: string, body: unknown, allowStatuses = [200]): Promise<T> {
  const result = await request<T>(path, { method: "PUT", body, allowStatuses });
  return result.data;
}

async function apiPatch<T>(path: string, body: unknown, allowStatuses = [200]): Promise<T> {
  const result = await request<T>(path, { method: "PATCH", body, allowStatuses });
  return result.data;
}

async function authPost<T>(
  path: string,
  body: unknown,
  allowStatuses = [200, 201],
): Promise<RequestResult<T>> {
  return request<T>(path, { method: "POST", body, authPath: true, allowStatuses });
}

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

async function patchAdminUserInDb() {
  const { execSync } = await import("node:child_process");
  const sql = `UPDATE user SET role = 'admin', banned = 0 WHERE email = '${sqlEscape(ADMIN_EMAIL)}'`;
  const command = `npx wrangler d1 execute ${DB_NAME} --local --command="${sql.replace(/"/g, '\\"')}"`;
  execSync(command, { cwd: process.cwd(), stdio: "pipe" });
}

function dateOnlyForMonthOffset(monthOffset: number, day: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, day, 12, 0, 0, 0),
  ).toISOString().slice(0, 10);
}

function dateOnlyDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function monthKeyNow(): string {
  return new Date().toISOString().slice(0, 7);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isoAtDaysFromNow(daysFromNow: number, hourUtc: number, minuteUtc = 0): string {
  const base = addDays(new Date(), daysFromNow);
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hourUtc, minuteUtc, 0, 0),
  ).toISOString();
}

function weekdayFromDateOnly(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function isScheduledDate(
  date: string,
  startDate: string,
  frequencyType: HabitFrequencyType,
  frequencyDays: number[],
): boolean {
  if (date < startDate) return false;
  if (frequencyType === "daily") return true;
  return frequencyDays.includes(weekdayFromDateOnly(date));
}

function txnKey(txn: {
  type: string;
  amount: number;
  date: string;
  accountId: string;
  description: string;
}): string {
  return `${txn.type}|${txn.amount}|${txn.date}|${txn.accountId}|${txn.description}`;
}

async function ensureCategories(): Promise<Map<string, Category>> {
  const defs = [
    { title: "Salary", details: "Monthly salary", color: "#22C55E", icon: "cash-outline" },
    { title: "Food", details: "Meals and groceries", color: "#F97316", icon: "restaurant-outline" },
    { title: "Transport", details: "Rides and fuel", color: "#3B82F6", icon: "car-outline" },
    { title: "Shopping", details: "Clothes and gadgets", color: "#A855F7", icon: "bag-outline" },
    { title: "Rent", details: "Monthly rent", color: "#EF4444", icon: "home-outline" },
    { title: "Freelance", details: "Side income", color: "#14B8A6", icon: "laptop-outline" },
    { title: "Education", details: "Books and learning", color: "#0EA5E9", icon: "book-outline" },
  ] as const;

  const existing = await apiGet<Category[]>("/categories");
  const byTitle = new Map<string, Category>(existing.map((item) => [item.title, item]));
  let created = 0;

  for (const def of defs) {
    if (byTitle.has(def.title)) continue;
    const row = await apiPost<Category>("/categories", def);
    byTitle.set(row.title, row);
    created += 1;
  }

  console.log(`✓ Categories ready (${byTitle.size} total, +${created} new)`);
  return byTitle;
}

async function ensureAccounts(): Promise<Map<string, Account>> {
  const defs = [
    { name: "BRAC Bank", type: "bank_account" as const, currency: "BDT" as const, balance: 0 },
    { name: "Cash Wallet", type: "cash" as const, currency: "BDT" as const, balance: 0 },
    { name: "Wise USD", type: "bank_account" as const, currency: "USD" as const, balance: 0 },
    { name: "WeChat Pay", type: "card" as const, currency: "RMB" as const, balance: 0 },
  ] as const;

  const existing = await apiGet<Account[]>("/accounts");
  const byName = new Map<string, Account>(existing.map((item) => [item.name, item]));
  let created = 0;

  for (const def of defs) {
    if (byName.has(def.name)) continue;
    const row = await apiPost<Account>("/accounts", def);
    byName.set(row.name, row);
    created += 1;
  }

  console.log(`✓ Accounts ready (${byName.size} total, +${created} new)`);
  return byName;
}

async function ensureTransactions(
  categoriesByTitle: Map<string, Category>,
  accountsByName: Map<string, Account>,
) {
  const defs: SeedTransactionDef[] = [
    { amount: 8500000, type: "income", date: dateOnlyForMonthOffset(0, 1), description: "[seed] Salary (BDT)", categoryTitle: "Salary", accountName: "BRAC Bank" },
    { amount: 2500000, type: "expense", date: dateOnlyForMonthOffset(0, 3), description: "[seed] Rent payment", categoryTitle: "Rent", accountName: "BRAC Bank" },
    { amount: 65000, type: "expense", date: dateOnlyForMonthOffset(0, 5), description: "[seed] Grocery run", categoryTitle: "Food", accountName: "Cash Wallet" },
    { amount: 140000, type: "expense", date: dateOnlyForMonthOffset(0, 7), description: "[seed] Daily commute", categoryTitle: "Transport", accountName: "Cash Wallet" },
    { amount: 240000, type: "expense", date: dateOnlyForMonthOffset(0, 10), description: "[seed] Earbuds purchase", categoryTitle: "Shopping", accountName: "BRAC Bank" },
    { amount: 230000, type: "income", date: dateOnlyForMonthOffset(0, 2), description: "[seed] Freelance payout (USD)", categoryTitle: "Freelance", accountName: "Wise USD" },
    { amount: 4999, type: "expense", date: dateOnlyForMonthOffset(0, 8), description: "[seed] Streaming subscription", categoryTitle: "Shopping", accountName: "Wise USD" },
    { amount: 800000, type: "income", date: dateOnlyForMonthOffset(0, 1), description: "[seed] RMB stipend", categoryTitle: "Salary", accountName: "WeChat Pay" },
    { amount: 22000, type: "expense", date: dateOnlyForMonthOffset(0, 4), description: "[seed] Noodles and tea", categoryTitle: "Food", accountName: "WeChat Pay" },
    { amount: 54000, type: "expense", date: dateOnlyForMonthOffset(0, 9), description: "[seed] City travel", categoryTitle: "Transport", accountName: "WeChat Pay" },
    { amount: 8500000, type: "income", date: dateOnlyForMonthOffset(-1, 1), description: "[seed] Salary previous month", categoryTitle: "Salary", accountName: "BRAC Bank" },
    { amount: 2500000, type: "expense", date: dateOnlyForMonthOffset(-1, 3), description: "[seed] Rent previous month", categoryTitle: "Rent", accountName: "BRAC Bank" },
  ];

  const existing = await apiGet<Transaction[]>("/transactions");
  const existingKeys = new Set(existing.map(txnKey));
  let created = 0;

  for (const def of defs) {
    const category = categoriesByTitle.get(def.categoryTitle);
    const account = accountsByName.get(def.accountName);
    if (!category || !account) {
      throw new Error(`Missing mapping for transaction: ${def.description}`);
    }

    const payload = {
      amount: def.amount,
      type: def.type,
      date: def.date,
      description: def.description,
      categoryId: category.id,
      accountId: account.id,
    };

    const key = txnKey(payload);
    if (existingKeys.has(key)) continue;

    await apiPost("/transactions", payload);
    existingKeys.add(key);
    created += 1;
  }

  console.log(`✓ Transactions seeded (+${created} new)`);
}

async function ensureBudgets(
  categoriesByTitle: Map<string, Category>,
  accountsByName: Map<string, Account>,
) {
  const month = monthKeyNow();
  const defs: SeedBudgetDef[] = [
    { accountName: "BRAC Bank", categoryTitle: "Food", limit: 350000 },
    { accountName: "BRAC Bank", categoryTitle: "Transport", limit: 200000 },
    { accountName: "BRAC Bank", categoryTitle: "Shopping", limit: 500000 },
    { accountName: "Cash Wallet", categoryTitle: "Food", limit: 120000 },
    { accountName: "Cash Wallet", categoryTitle: "Transport", limit: 180000 },
    { accountName: "Wise USD", categoryTitle: "Shopping", limit: 12000 },
    { accountName: "WeChat Pay", categoryTitle: "Food", limit: 90000 },
  ];

  const current = await apiGet<BudgetResponse>(`/budgets?month=${encodeURIComponent(month)}`);
  const existingKeys = new Set(
    current.items.map((item) => `${item.accountId}:${item.categoryId}`),
  );
  let created = 0;

  for (const def of defs) {
    const category = categoriesByTitle.get(def.categoryTitle);
    const account = accountsByName.get(def.accountName);
    if (!category || !account) {
      throw new Error(`Missing mapping for budget: ${def.accountName} / ${def.categoryTitle}`);
    }

    const key = `${account.id}:${category.id}`;
    if (existingKeys.has(key)) continue;

    await apiPost(
      "/budgets",
      {
        month,
        categoryId: category.id,
        accountId: account.id,
        limit: def.limit,
      },
      [201, 409],
    );
    existingKeys.add(key);
    created += 1;
  }

  console.log(`✓ Budgets ready for ${month} (+${created} new)`);
}

function generateYesNoLogs(days: number): SeedHabitLogDef[] {
  const logs: SeedHabitLogDef[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const completed = offset % 3 !== 0;
    logs.push({
      date: dateOnlyDaysAgo(offset),
      completed,
      note: completed ? "Completed as planned." : "",
    });
  }
  return logs;
}

function generateMeasurableLogs(days: number, values: number[]): SeedHabitLogDef[] {
  const logs: SeedHabitLogDef[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const value = values[(days - 1 - offset) % values.length] ?? 0;
    logs.push({
      date: dateOnlyDaysAgo(offset),
      value,
      note: value > 0 ? `Logged value: ${value}` : "",
    });
  }
  return logs;
}

function generateWeekdayLogs(
  days: number,
  startDate: string,
  weekdays: number[],
): SeedHabitLogDef[] {
  const logs: SeedHabitLogDef[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = dateOnlyDaysAgo(offset);
    if (!isScheduledDate(date, startDate, "weekdays", weekdays)) continue;
    const completed = offset % 2 === 0;
    logs.push({
      date,
      completed,
      note: completed ? "Done on schedule." : "",
    });
  }
  return logs;
}

async function ensureHabitPreferences() {
  await apiPut("/habits/preferences", {
    weekStart: "device",
    defaultFilter: "all",
    timelineDays: 30,
    showArchivedByDefault: false,
    requireNoteForCompletion: false,
    reminderMasterEnabled: true,
    defaultReminderEnabled: false,
    defaultReminderTime: "21:00",
  });
  console.log("✓ Habit preferences set");
}

async function ensureHabits() {
  const weekdayHabitStartDate = dateOnlyDaysAgo(45);
  const habitDefs: SeedHabitDef[] = [
    {
      name: "Gym Exercise",
      question: "Did you exercise today?",
      type: "yes_no",
      color: "#e88795",
      unit: null,
      dailyTarget: null,
      frequencyType: "daily",
      frequencyDays: [],
      reminderEnabled: true,
      reminderTime: "22:00",
      notes: "Core workout habit",
      startDate: dateOnlyDaysAgo(30),
      logs: generateYesNoLogs(14),
    },
    {
      name: "Reading",
      question: "How many pages did you read today?",
      type: "measurable",
      color: "#5fa5db",
      unit: "pages",
      dailyTarget: 20,
      frequencyType: "daily",
      frequencyDays: [],
      reminderEnabled: false,
      reminderTime: null,
      notes: "Daily focused reading",
      startDate: dateOnlyDaysAgo(30),
      logs: generateMeasurableLogs(14, [8, 14, 20, 24, 16, 22, 18]),
    },
    {
      name: "Quran Study",
      question: "Did you complete your Quran study session?",
      type: "yes_no",
      color: "#65b68b",
      unit: null,
      dailyTarget: null,
      frequencyType: "weekdays",
      frequencyDays: [1, 3, 5],
      reminderEnabled: true,
      reminderTime: "06:30",
      notes: "Mon/Wed/Fri routine",
      startDate: weekdayHabitStartDate,
      logs: generateWeekdayLogs(28, weekdayHabitStartDate, [1, 3, 5]),
    },
  ];

  const list = await apiGet<HabitListResponse>(
    "/habits?filter=all&includeArchived=true&days=30",
  );
  const byName = new Map<string, HabitListItem>(list.items.map((item) => [item.name, item]));
  let created = 0;
  let updated = 0;
  let logsUpserted = 0;

  for (const def of habitDefs) {
    const existing = byName.get(def.name);
    let habitId = existing?.id;

    if (existing?.archivedAt) {
      await apiPost(`/habits/${existing.id}/restore`, {}, [200, 404]);
    }

    if (habitId) {
      await apiPut<Habit>(`/habits/${habitId}`, {
        name: def.name,
        question: def.question,
        type: def.type,
        color: def.color,
        unit: def.unit,
        dailyTarget: def.dailyTarget,
        frequencyType: def.frequencyType,
        frequencyDays: def.frequencyType === "daily" ? undefined : def.frequencyDays,
        reminderEnabled: def.reminderEnabled,
        reminderTime: def.reminderEnabled ? def.reminderTime : null,
        notes: def.notes,
        startDate: def.startDate,
      });
      updated += 1;
    } else {
      const createdHabit = await apiPost<Habit>("/habits", {
        name: def.name,
        question: def.question,
        type: def.type,
        color: def.color,
        unit: def.unit,
        dailyTarget: def.dailyTarget,
        frequencyType: def.frequencyType,
        frequencyDays: def.frequencyType === "daily" ? undefined : def.frequencyDays,
        reminderEnabled: def.reminderEnabled,
        reminderTime: def.reminderEnabled ? def.reminderTime : null,
        notes: def.notes,
        startDate: def.startDate,
      });
      habitId = createdHabit.id;
      created += 1;
    }

    if (!habitId) {
      throw new Error(`Unable to resolve habit ID for ${def.name}`);
    }

    for (const log of def.logs) {
      if (
        !isScheduledDate(log.date, def.startDate, def.frequencyType, def.frequencyDays)
      ) {
        continue;
      }

      if (def.type === "yes_no") {
        await apiPost(`/habits/${habitId}/logs`, {
          date: log.date,
          completed: Boolean(log.completed),
          note: log.note ?? "",
        });
      } else {
        await apiPost(`/habits/${habitId}/logs`, {
          date: log.date,
          value: log.value ?? 0,
          note: log.note ?? "",
        });
      }
      logsUpserted += 1;
    }
  }

  console.log(`✓ Habits ready (+${created} new, ${updated} updated, ${logsUpserted} logs upserted)`);
}

async function ensureNoteCategories(): Promise<Map<string, NoteCategory>> {
  const defs = ["Portfolio", "Finance", "Ideas", "Health", "Travel"] as const;
  const existing = await apiGet<NoteCategory[]>("/notes/categories");
  const byName = new Map<string, NoteCategory>(existing.map((item) => [item.name, item]));
  let created = 0;

  for (const name of defs) {
    if (byName.has(name)) continue;
    const row = await apiPost<NoteCategory>("/notes/categories", { name }, [201, 409]);
    byName.set(row.name, row);
    created += 1;
  }

  console.log(`✓ Note categories ready (${byName.size} total, +${created} new)`);
  return byName;
}

async function ensureNotes(categoriesByName: Map<string, NoteCategory>) {
  const defs: SeedNoteDef[] = [
    {
      title: "[seed] Portfolio story",
      categoryName: "Portfolio",
      pinned: true,
      content: [
        "Harmoniq demo profile for portfolio walkthroughs.",
        "",
        "- Money tracker shows multi-currency balances, budgets, and recent transactions.",
        "- Habits show streak-like daily data and measurable progress.",
        "- Planner shows upcoming events and reminders.",
        "- AI assistant can reason across enabled money, habit, note, and event context.",
      ].join("\n"),
    },
    {
      title: "[seed] Monthly finance review",
      categoryName: "Finance",
      pinned: true,
      content: [
        "Review talking points:",
        "- Salary and freelance income are separated by currency.",
        "- Food and transport budgets are intentionally active for dashboard screenshots.",
        "- Use the dashboard to show month-to-date spending and budget pressure.",
      ].join("\n"),
    },
    {
      title: "[seed] AI assistant prompts",
      categoryName: "Ideas",
      content: [
        "Try these demo prompts:",
        "1. Summarize my spending and habits this week.",
        "2. What should I watch before my portfolio review event?",
        "3. Draft a note from my current budget pressure.",
        "4. Create a habit for reviewing money every Friday.",
      ].join("\n"),
    },
    {
      title: "[seed] Wellness goals",
      categoryName: "Health",
      content: "Keep gym, reading, and Quran study visible as a balanced lifestyle demo.",
    },
    {
      title: "[seed] Archived launch notes",
      categoryName: "Portfolio",
      archived: true,
      content: "Archived example note for testing the notes archive workflow.",
    },
  ];

  const existing = await apiGet<Note[]>("/notes?includeArchived=true");
  const byTitle = new Map<string, Note>(existing.map((item) => [item.title, item]));
  let created = 0;
  let updated = 0;

  for (const def of defs) {
    const category = categoriesByName.get(def.categoryName);
    if (!category) throw new Error(`Missing note category: ${def.categoryName}`);

    const existingNote = byTitle.get(def.title);
    const payload = {
      title: def.title,
      content: def.content,
      categoryId: category.id,
    };

    const note = existingNote
      ? await apiPut<Note>(`/notes/${existingNote.id}`, {
          ...payload,
          isPinned: Boolean(def.pinned),
          archivedAt: def.archived ? (existingNote.archivedAt ?? new Date().toISOString()) : null,
        })
      : await apiPost<Note>("/notes", payload);

    if (existingNote) {
      updated += 1;
    } else {
      created += 1;
    }

    if (def.pinned && !note.isPinned) {
      await apiPatch<Note>(`/notes/${note.id}/pin`, {});
    }
    if (def.archived && !note.archivedAt) {
      await apiPatch<Note>(`/notes/${note.id}/archive`, {});
    }
    if (!def.archived && note.archivedAt) {
      await apiPatch<Note>(`/notes/${note.id}/unarchive`, {});
    }
  }

  console.log(`✓ Notes ready (+${created} new, ${updated} updated)`);
}

async function ensureEvents() {
  const defs: SeedEventDef[] = [
    {
      title: "[seed] Portfolio review call",
      description: "Walk through Harmoniq's money, habits, notes, planner, and AI assistant flows.",
      location: "Google Meet",
      timezone: "Asia/Shanghai",
      isAllDay: false,
      startAt: isoAtDaysFromNow(2, 7),
      endAt: isoAtDaysFromNow(2, 8),
      reminderMinutes: 15,
    },
    {
      title: "[seed] Budget cleanup session",
      description: "Review month-to-date expenses and adjust categories before the next demo.",
      location: "Home office",
      timezone: "Asia/Shanghai",
      isAllDay: false,
      startAt: isoAtDaysFromNow(4, 12),
      endAt: isoAtDaysFromNow(4, 13),
      reminderMinutes: 10,
    },
    {
      title: "[seed] Habit reflection",
      description: "Check gym, reading, and Quran study progress.",
      location: "",
      timezone: "Asia/Shanghai",
      isAllDay: false,
      startAt: isoAtDaysFromNow(6, 14),
      endAt: isoAtDaysFromNow(6, 14, 30),
      reminderMinutes: 5,
    },
    {
      title: "[seed] Demo travel day",
      description: "All-day planner example for date handling and event list screenshots.",
      location: "Shanghai",
      timezone: "Asia/Shanghai",
      isAllDay: true,
      startAt: isoAtDaysFromNow(9, 0),
      endAt: isoAtDaysFromNow(10, 0),
      reminderMinutes: 10080,
    },
  ];

  const from = encodeURIComponent(isoAtDaysFromNow(-7, 0));
  const to = encodeURIComponent(isoAtDaysFromNow(45, 23, 59));
  const existing = await apiGet<EventItem[]>(`/events?from=${from}&to=${to}`);
  const byTitle = new Map<string, EventItem>(existing.map((item) => [item.title, item]));
  let created = 0;
  let updated = 0;

  for (const def of defs) {
    const existingEvent = byTitle.get(def.title);
    if (existingEvent) {
      await apiPut<EventItem>(`/events/${existingEvent.id}`, def);
      updated += 1;
    } else {
      const createdEvent = await apiPost<EventItem>("/events", def);
      byTitle.set(createdEvent.title, createdEvent);
      created += 1;
    }
  }

  console.log(`✓ Planner events ready (+${created} new, ${updated} updated)`);
}

async function ensureAiChats() {
  const defs: SeedAiChatDef[] = [
    {
      title: "[seed] Portfolio demo copilot",
      pinned: true,
      customInstruction: "Help present Harmoniq as a polished portfolio product. Keep answers concise and connect money, habits, notes, and planner context.",
    },
    {
      title: "[seed] Money and habit coach",
      customInstruction: "Focus on practical weekly guidance using money tracker, budgets, habits, and notes.",
    },
  ];

  const existing = await apiGet<AiChat[]>("/ai/chats");
  const byTitle = new Map<string, AiChat>(existing.map((item) => [item.title, item]));
  let created = 0;
  let updated = 0;

  for (const def of defs) {
    const existingChat = byTitle.get(def.title);
    const payload = {
      title: def.title,
      customInstruction: def.customInstruction,
      contexts: {
        money: true,
        habits: true,
        notes: true,
        events: true,
      },
    };

    if (existingChat) {
      await apiPatch<AiChat>(`/ai/chats/${existingChat.id}`, {
        ...payload,
        pinned: Boolean(def.pinned),
      });
      updated += 1;
    } else {
      const createdChat = await apiPost<AiChat>("/ai/chats", payload);
      if (def.pinned) {
        await apiPatch<AiChat>(`/ai/chats/${createdChat.id}`, { pinned: true });
      }
      created += 1;
    }
  }

  console.log(`✓ AI chat presets ready (+${created} new, ${updated} updated)`);
}

async function seed() {
  if (args.has("--help") || args.has("-h")) {
    console.log([
      "Seed Harmoniq demo data.",
      "",
      "Usage:",
      "  npm run seed",
      "",
      "Environment overrides:",
      "  SEED_BASE_URL=http://localhost:5173",
      "  SEED_DB_NAME=harmoniq-db",
      "  SEED_ADMIN_EMAIL=admin@example.com",
      "  SEED_ADMIN_PASSWORD=admin@123",
      "  SEED_ADMIN_NAME=Admin",
      "  SEED_ADMIN_USERNAME=admin_seed",
    ].join("\n"));
    return;
  }

  console.log("🌱 Starting full seed...\n");
  console.log(`Base URL: ${BASE}`);
  console.log(`DB Name : ${DB_NAME}\n`);

  console.log(`Registering ${ADMIN_EMAIL}...`);
  await authPost(
    "/api/auth/sign-up/email",
    {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
    [200, 201, 409, 422],
  );

  console.log("Patching admin role in local D1...");
  try {
    await patchAdminUserInDb();
    console.log("✓ Admin patched");
  } catch (error) {
    console.log(`⚠ Could not patch admin user automatically: ${String(error)}`);
  }

  console.log("Signing in...");
  await authPost(
    "/api/auth/sign-in/email",
    {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
    [200],
  );

  if (!sessionCookie) {
    throw new Error("No session cookie received after sign-in");
  }
  console.log("✓ Signed in\n");

  await apiPut("/profile", {
    name: ADMIN_NAME,
    username: ADMIN_USERNAME,
    photoUrl: null,
    about: "Seeded admin profile",
  });
  console.log("✓ Profile upserted");

  const categoriesByTitle = await ensureCategories();
  const accountsByName = await ensureAccounts();
  await ensureTransactions(categoriesByTitle, accountsByName);
  await ensureBudgets(categoriesByTitle, accountsByName);
  await ensureHabitPreferences();
  await ensureHabits();
  const noteCategoriesByName = await ensureNoteCategories();
  await ensureNotes(noteCategoriesByName);
  await ensureEvents();
  await ensureAiChats();

  console.log("\n🎉 Seed complete");
  console.log(`   Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

seed().catch((error) => {
  console.error("\nSeed failed:", error);
  process.exit(1);
});
