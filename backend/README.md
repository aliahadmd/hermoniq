# Harmoniq Backend

Cloudflare Workers backend for Harmoniq. This project contains the Hono API, Better Auth integration, Drizzle/D1 schema, admin dashboard, AI assistant, and backend tests.

Run commands from this directory. The mobile app is a separate project in `../app`.

## Stack

- Cloudflare Workers with Wrangler.
- Hono for API routing and middleware.
- D1 SQLite with Drizzle ORM and SQL migrations.
- Better Auth for authentication.
- React 19, Vite, TanStack Router, and Tailwind for the admin dashboard.
- Workers AI, Durable Objects, Vectorize, R2, and optional AutoRAG for the AI assistant.
- Vitest, better-sqlite3, and fast-check for tests.

## Project Structure

```text
src/
  worker/
    index.ts              Worker entrypoint and route mounting
    middleware/           Auth, admin, and error middleware
    routes/               API route modules
    ai/                   AI context, prompt, planner, memory, vision
    agents/               Durable Object chat session agent
    utils/                Shared Worker utilities
  db/
    schema.ts             Drizzle schema
    migrations/           SQL migrations
  auth/                   Better Auth and email helpers
  react-app/              Admin dashboard SPA
  __tests__/              Vitest tests and helpers
```

## Commands

```bash
npm install
npm run dev        # Start local Worker + admin dashboard
npm run build      # Type-check and build Worker/admin assets
npm run test       # Run all backend tests
npm run lint       # Run ESLint
npm run check      # Type-check, build, and Wrangler dry-run deploy
npm run cf-typegen # Regenerate worker-configuration.d.ts
npm run deploy     # Deploy to Cloudflare
```

Run one test file:

```bash
npx vitest --run src/__tests__/accounts.test.ts
```

Run tests by name:

```bash
npx vitest --run -t "Account round-trip"
```

## Local Development

Start the backend:

```bash
npm run dev
```

The dev server normally runs at:

```text
http://localhost:5173
```

The API is mounted under `/api/*`. The admin dashboard is served by the same Vite/Worker development server.

## Configuration

Cloudflare bindings are configured in `wrangler.json`:

- `DB`: D1 database.
- `AI`: Workers AI binding.
- `AI_CHAT_SESSION`: Durable Object namespace for chat sessions.
- `CHAT_MEMORY_INDEX`: Vectorize index for chat memory.
- `AI_CHAT_MEDIA_BUCKET`: R2 bucket for AI chat attachments.

Important vars:

```text
AI_CHAT_MODEL=@cf/google/gemma-4-26b-a4b-it
AI_VISION_MODEL=@cf/llava-hf/llava-1.5-7b-hf
AI_EMBED_MODEL=@cf/baai/bge-base-en-v1.5
AI_SEARCH_ENABLED=false
AI_SEARCH_INSTANCE=
```

Secrets should be stored with Wrangler, not committed:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
```

After changing `wrangler.json`, regenerate types:

```bash
npm run cf-typegen
```

## API Areas

- `/api/auth/*`: Better Auth endpoints.
- `/api/accounts/*`: Money accounts.
- `/api/categories/*`: Transaction categories.
- `/api/transactions/*`: Income and expense records.
- `/api/budgets/*`: Monthly budgets.
- `/api/dashboard/*`: Money dashboard summaries.
- `/api/habits/*`: Habits, logs, preferences, and insights.
- `/api/notes/*`: Notes and note categories.
- `/api/events/*`: Planner events and ICS import.
- `/api/ai/*`: AI chats, messages, attachments, search, and pending actions.
- `/api/admin/users/*`: Admin-only user management.

## AI Assistant

The AI assistant uses a Durable Object per user/chat to keep message history and vector references. It builds a user-scoped ecosystem context from profile, money, habit, note, and event data.

Key files:

- `src/worker/agents/ai-chat-session-agent.ts`: Chat session Durable Object.
- `src/worker/ai/context.ts`: Personal ecosystem context snapshot.
- `src/worker/ai/prompt.ts`: Assistant system prompt and heuristic fallback parser.
- `src/worker/ai/action-planner.ts`: Structured pending-action planner with Zod validation.
- `src/worker/ai/action-executor.ts`: Confirmed pending-action execution.
- `src/worker/ai/vector-memory.ts`: Vectorize memory.
- `src/worker/ai/vision.ts`: R2 attachment loading and image context.

The assistant can propose one pending action at a time. It never executes create, update, delete, archive, or log operations until the user confirms the pending action.

## Database

Schema lives in `src/db/schema.ts`; migrations live in `src/db/migrations/`.

Generate a migration after schema changes:

```bash
npx drizzle-kit generate
```

Apply migrations through the normal Wrangler/D1 workflow for the target environment.

## Testing

Tests use in-memory SQLite through `better-sqlite3` and Hono request helpers. No local HTTP server is required for most tests.

Useful files:

- `src/__tests__/helpers/test-app.ts`: In-memory app/database setup.
- `src/__tests__/*.test.ts`: Standard tests.
- `src/__tests__/*.property.test.ts`: fast-check property tests.

## Notes

- Every query for user-owned data must include `userId` ownership scoping.
- Keep `src/worker/validators.ts` in sync with `../app/lib/validators.ts` when shared request shapes change.
- `npm run lint` may surface existing test cleanup work; run targeted ESLint on changed files when isolating a feature branch.
