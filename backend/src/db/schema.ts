import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const accounts = sqliteTable("accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  type: text("type", { enum: ["bank_account", "card", "cash"] }).notNull(),
  currency: text("currency", { enum: ["BDT", "USD", "RMB"] }).notNull(),
  balance: integer("balance").notNull().default(0),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const categories = sqliteTable("categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  title: text("title").notNull(),
  details: text("details").notNull().default(""),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
});

export const transactions = sqliteTable("transactions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  amount: integer("amount").notNull(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  date: text("date").notNull(),
  description: text("description").notNull().default(""),
  categoryId: text("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const monthlyBudgets = sqliteTable(
  "monthly_budgets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    month: text("month").notNull(), // YYYY-MM
    amountLimit: integer("amount_limit").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("monthly_budgets_user_month_account_category_unique").on(
      table.userId,
      table.month,
      table.accountId,
      table.categoryId,
    ),
  ],
);

export const habits = sqliteTable("habits", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  question: text("question").notNull(),
  type: text("type", { enum: ["yes_no", "measurable"] }).notNull(),
  color: text("color").notNull(),
  unit: text("unit"),
  dailyTarget: integer("daily_target"),
  frequencyType: text("frequency_type", { enum: ["daily", "weekdays"] }).notNull(),
  frequencyDays: text("frequency_days").notNull().default("[]"),
  reminderEnabled: integer("reminder_enabled", { mode: "boolean" }).notNull().default(false),
  reminderTime: text("reminder_time"),
  notes: text("notes").notNull().default(""),
  startDate: text("start_date").notNull(),
  archivedAt: text("archived_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const habitLogs = sqliteTable(
  "habit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    habitId: text("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    logDate: text("log_date").notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    value: integer("value"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("habit_logs_habit_date_unique").on(table.habitId, table.logDate),
  ],
);

export const habitPreferences = sqliteTable("habit_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  weekStart: text("week_start", { enum: ["device", "sunday", "monday"] })
    .notNull()
    .default("device"),
  defaultFilter: text("default_filter", { enum: ["all", "due_today", "completed_today"] })
    .notNull()
    .default("all"),
  timelineDays: integer("timeline_days").notNull().default(30),
  showArchivedByDefault: integer("show_archived_by_default", { mode: "boolean" }).notNull().default(false),
  requireNoteForCompletion: integer("require_note_for_completion", { mode: "boolean" }).notNull().default(false),
  reminderMasterEnabled: integer("reminder_master_enabled", { mode: "boolean" }).notNull().default(true),
  defaultReminderEnabled: integer("default_reminder_enabled", { mode: "boolean" }).notNull().default(false),
  defaultReminderTime: text("default_reminder_time"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const noteCategories = sqliteTable(
  "note_categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [uniqueIndex("note_categories_user_name_unique").on(table.userId, table.name)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
    archivedAt: text("archived_at"),
    categoryId: text("category_id").references(() => noteCategories.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("notes_user_updated_idx").on(table.userId, table.updatedAt),
    index("notes_user_category_idx").on(table.userId, table.categoryId),
    index("notes_user_archived_updated_idx").on(table.userId, table.archivedAt, table.updatedAt),
    index("notes_user_pinned_updated_idx").on(table.userId, table.isPinned, table.updatedAt),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    location: text("location").notNull().default(""),
    timezone: text("timezone").notNull(),
    isAllDay: integer("is_all_day", { mode: "boolean" }).notNull().default(false),
    startAt: text("start_at").notNull(),
    endAt: text("end_at").notNull(),
    reminderMinutes: integer("reminder_minutes"),
    source: text("source", { enum: ["manual", "ics"] }).notNull().default("manual"),
    externalUid: text("external_uid"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("events_user_start_idx").on(table.userId, table.startAt),
    index("events_user_end_idx").on(table.userId, table.endAt),
    uniqueIndex("events_user_external_uid_start_unique").on(
      table.userId,
      table.externalUid,
      table.startAt,
    ),
  ],
);

export const aiChats = sqliteTable(
  "ai_chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    customInstruction: text("custom_instruction").notNull().default(""),
    contextMoney: integer("context_money", { mode: "boolean" }).notNull().default(true),
    contextHabits: integer("context_habits", { mode: "boolean" }).notNull().default(true),
    contextNotes: integer("context_notes", { mode: "boolean" }).notNull().default(false),
    contextEvents: integer("context_events", { mode: "boolean" }).notNull().default(false),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    lastMessagePreview: text("last_message_preview").notNull().default(""),
    lastActiveAt: text("last_active_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index("ai_chats_user_last_active_idx").on(table.userId, table.lastActiveAt)],
);

export const aiPendingActions = sqliteTable(
  "ai_pending_actions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    chatId: text("chat_id")
      .notNull()
      .references(() => aiChats.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
    status: text("status", { enum: ["pending", "confirmed", "canceled", "expired"] })
      .notNull()
      .default("pending"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("ai_pending_actions_chat_status_idx").on(table.chatId, table.status),
    index("ai_pending_actions_user_status_idx").on(table.userId, table.status),
  ],
);

export const aiChatAttachments = sqliteTable(
  "ai_chat_attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chatId: text("chat_id")
      .notNull()
      .references(() => aiChats.id, { onDelete: "cascade" }),
    messageId: text("message_id"),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    status: text("status", { enum: ["uploaded", "linked", "deleted"] }).notNull().default("uploaded"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("ai_chat_attachments_user_chat_status_idx").on(table.userId, table.chatId, table.status),
    index("ai_chat_attachments_chat_message_idx").on(table.chatId, table.messageId),
    index("ai_chat_attachments_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const profiles = sqliteTable("profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  photoUrl: text("photo_url"),
  username: text("username").notNull().unique(),
  about: text("about"),
  location: text("location"),
  gender: text("gender"),
  website: text("website"),
  workCompany: text("work_company"),
  workPosition: text("work_position"),
  workDescription: text("work_description"),
  educationSchool: text("education_school"),
  educationDegree: text("education_degree"),
  educationGraduated: integer("education_graduated", { mode: "boolean" }),
  userId: text("user_id").unique().references(() => user.id, { onDelete: "cascade" }),
});

// ── Better Auth tables ──────────────────────────────────────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role").default("user"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("banReason"),
  banExpires: integer("banExpires"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  token: text("token").notNull().unique(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const authAccount = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  idToken: text("idToken"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});
