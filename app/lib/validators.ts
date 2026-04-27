import { z } from 'zod';

export const currencySchema = z.enum(['BDT', 'USD', 'RMB']);
export const accountTypeSchema = z.enum(['bank_account', 'card', 'cash']);
export const transactionTypeSchema = z.enum(['income', 'expense']);
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

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

export const dateOnlySchema = z
  .string()
  .regex(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  .refine(isValidDateOnly, { message: 'Invalid date. Expected YYYY-MM-DD.' });
export const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);
export const habitTypeSchema = z.enum(['yes_no', 'measurable']);
export const habitFrequencySchema = z.enum(['daily', 'weekdays']);
export const habitWeekStartSchema = z.enum(['device', 'sunday', 'monday']);
export const habitTimelineDaysSchema = z.union([z.literal(7), z.literal(14), z.literal(30)]);
export const weekdayArraySchema = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .refine((days) => new Set(days).size === days.length, {
    message: 'Weekdays must be unique',
  });

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: accountTypeSchema,
  currency: currencySchema,
  balance: z.number().int(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: accountTypeSchema.optional(),
  balance: z.number().int().optional(),
});

export const createTransactionSchema = z.object({
  amount: z.number().int().positive(),
  type: transactionTypeSchema,
  date: dateOnlySchema,
  description: z.string().max(500).default(''),
  categoryId: z.string().nullable().optional(),
  accountId: z.string().min(1),
});

export const createCategorySchema = z.object({
  title: z.string().min(1).max(100),
  details: z.string().max(500).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1),
});

export const createMonthlyBudgetSchema = z.object({
  month: monthSchema,
  categoryId: z.string().min(1),
  accountId: z.string().min(1),
  limit: z.number().int().positive(),
});

export const updateMonthlyBudgetSchema = z.object({
  limit: z.number().int().positive(),
});

export const createHabitSchema = z
  .object({
    name: z.string().min(1).max(100),
    question: z.string().min(1).max(300),
    type: habitTypeSchema,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    unit: z.string().min(1).max(20).nullable().optional(),
    dailyTarget: z.number().int().positive().nullable().optional(),
    frequencyType: habitFrequencySchema,
    frequencyDays: weekdayArraySchema.optional(),
    reminderEnabled: z.boolean().default(false),
    reminderTime: hhmmSchema.nullable().optional(),
    notes: z.string().max(500).default(''),
    startDate: dateOnlySchema,
  })
  .superRefine((value, ctx) => {
    if (value.frequencyType === 'weekdays' && (!value.frequencyDays || value.frequencyDays.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select at least one weekday',
        path: ['frequencyDays'],
      });
    }
  });

export const updateHabitSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  question: z.string().min(1).max(300).optional(),
  type: habitTypeSchema.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  unit: z.string().min(1).max(20).nullable().optional(),
  dailyTarget: z.number().int().positive().nullable().optional(),
  frequencyType: habitFrequencySchema.optional(),
  frequencyDays: weekdayArraySchema.optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: hhmmSchema.nullable().optional(),
  notes: z.string().max(500).optional(),
  startDate: dateOnlySchema.optional(),
});

export const upsertHabitLogSchema = z
  .object({
    date: dateOnlySchema,
    completed: z.boolean().optional(),
    value: z.number().int().min(0).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((value) => value.completed !== undefined || value.value !== undefined, {
    message: 'Provide either completed or value',
  });

export const habitPreferenceSchema = z.object({
  weekStart: habitWeekStartSchema.optional(),
  defaultFilter: z.enum(['all', 'due_today', 'completed_today']).optional(),
  timelineDays: habitTimelineDaysSchema.optional(),
  showArchivedByDefault: z.boolean().optional(),
  requireNoteForCompletion: z.boolean().optional(),
  reminderMasterEnabled: z.boolean().optional(),
  defaultReminderEnabled: z.boolean().optional(),
  defaultReminderTime: hhmmSchema.nullable().optional(),
});

export const createNoteSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().max(10_000).default(''),
  categoryId: z.string().min(1).nullable().optional(),
});

export const updateNoteSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    content: z.string().max(10_000).optional(),
    categoryId: z.string().min(1).nullable().optional(),
    isPinned: z.boolean().optional(),
    archivedAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.content !== undefined ||
      value.categoryId !== undefined ||
      value.isPinned !== undefined ||
      value.archivedAt !== undefined,
    {
      message: 'Provide at least one field to update',
    },
  );

export const createNoteCategorySchema = z.object({
  name: z.string().min(1).max(40),
});

export const updateNoteCategorySchema = z.object({
  name: z.string().min(1).max(40),
});

export const noteListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  categoryId: z.string().min(1).optional(),
  includeArchived: z.boolean().optional(),
  pinnedOnly: z.boolean().optional(),
  sort: z.enum(['updated_desc', 'title_asc']).optional(),
});

const EVENT_REMINDER_VALUES = [0, 5, 10, 15, 10080] as const;

export const eventReminderMinutesSchema = z
  .number()
  .int()
  .refine((value) => EVENT_REMINDER_VALUES.includes(value as (typeof EVENT_REMINDER_VALUES)[number]), {
    message: 'Reminder must be one of: 0, 5, 10, 15, 10080',
  });

export const createEventSchema = z
  .object({
    title: z.string().min(1).max(160),
    description: z.string().max(4_000).default(''),
    location: z.string().max(240).default(''),
    timezone: z.string().min(1).max(100),
    isAllDay: z.boolean().default(false),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    reminderMinutes: eventReminderMinutesSchema.nullable().optional(),
    source: z.enum(['manual', 'ics']).optional(),
    externalUid: z.string().max(300).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (new Date(value.endAt).getTime() <= new Date(value.startAt).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endAt must be greater than startAt',
        path: ['endAt'],
      });
    }
  });

export const updateEventSchema = z
  .object({
    title: z.string().min(1).max(160).optional(),
    description: z.string().max(4_000).optional(),
    location: z.string().max(240).optional(),
    timezone: z.string().min(1).max(100).optional(),
    isAllDay: z.boolean().optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    reminderMinutes: eventReminderMinutesSchema.nullable().optional(),
    externalUid: z.string().max(300).nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.location !== undefined ||
      value.timezone !== undefined ||
      value.isAllDay !== undefined ||
      value.startAt !== undefined ||
      value.endAt !== undefined ||
      value.reminderMinutes !== undefined ||
      value.externalUid !== undefined,
    {
      message: 'Provide at least one field to update',
    },
  )
  .superRefine((value, ctx) => {
    if (value.startAt && value.endAt) {
      if (new Date(value.endAt).getTime() <= new Date(value.startAt).getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endAt must be greater than startAt',
          path: ['endAt'],
        });
      }
    }
  });

export const listEventsQuerySchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    q: z.string().max(120).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.from || !value.to) {
      return;
    }
    if (new Date(value.to).getTime() <= new Date(value.from).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'to must be greater than from',
        path: ['to'],
      });
    }
  });

export const importIcsSchema = z.object({
  ics: z.string().min(1),
  timezone: z.string().min(1).max(100).optional(),
});

export const aiContextSchema = z.object({
  money: z.boolean().optional(),
  habits: z.boolean().optional(),
  notes: z.boolean().optional(),
  events: z.boolean().optional(),
});

export const createAiChatSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  customInstruction: z.string().max(2_000).optional(),
  contexts: aiContextSchema.optional(),
});

export const updateAiChatSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    customInstruction: z.string().max(2_000).optional(),
    pinned: z.boolean().optional(),
    contexts: aiContextSchema.optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.customInstruction !== undefined ||
      value.pinned !== undefined ||
      value.contexts !== undefined,
    {
      message: 'Provide at least one field to update',
    },
  );

const aiAttachmentIdsSchema = z.array(z.string().min(1)).max(4);

export const sendAiMessageSchema = z
  .object({
    message: z.string().max(4_000).optional(),
    attachmentIds: aiAttachmentIdsSchema.optional(),
    contexts: aiContextSchema.optional(),
    timezone: z.string().min(1).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    const hasMessage = typeof value.message === 'string' && value.message.trim().length > 0;
    const hasAttachments = Array.isArray(value.attachmentIds) && value.attachmentIds.length > 0;

    if (!hasMessage && !hasAttachments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide a message or at least one attachment',
        path: ['message'],
      });
    }

    if (value.message !== undefined && value.message.trim().length === 0 && !hasAttachments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Message cannot be empty',
        path: ['message'],
      });
    }
  });

export const sendAiMessageStreamSchema = sendAiMessageSchema;

export const aiSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(50).optional(),
});

export const updateCategorySchema = z.object({
  title: z.string().min(1).max(100).optional(),
  details: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().min(1).optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  photoUrl: z.string().url().nullable().optional(),
  username: z.string()
    .min(1).max(30)
    .regex(/^[a-z0-9_-]+$/, 'Username must contain only lowercase letters, numbers, underscores, and hyphens')
    .optional(),
  about: z.string().max(100).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
  gender: z.string().max(50).nullable().optional(),
  website: z.string().url().nullable().optional(),
  workCompany: z.string().max(100).nullable().optional(),
  workPosition: z.string().max(100).nullable().optional(),
  workDescription: z.string().max(500).nullable().optional(),
  educationSchool: z.string().max(100).nullable().optional(),
  educationDegree: z.string().max(100).nullable().optional(),
  educationGraduated: z.boolean().nullable().optional(),
});

// Auth schemas
export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
    email: z.string().min(1, 'Email is required').email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password is too long'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const verifyEmailSchema = z.object({
  otp: z
    .string()
    .min(1, 'Verification code is required')
    .max(6, 'Code must be at most 6 digits')
    .regex(/^\d+$/, 'Code must contain only digits'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
