import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/error-handler";
import { authMiddleware } from "./middleware/auth";
import { createAuth } from "../auth";
import { accountRoutes } from "./routes/accounts";
import { categoryRoutes } from "./routes/categories";
import { transactionRoutes } from "./routes/transactions";
import { profileRoutes } from "./routes/profile";
import { dashboardRoutes } from "./routes/dashboard";
import { budgetRoutes } from "./routes/budgets";
import { habitRoutes } from "./routes/habits";
import { noteRoutes } from "./routes/notes";
import { adminUserRoutes } from "./routes/admin-users";
import { adminMiddleware } from "./middleware/admin";
import { aiRoutes } from "./routes/ai";
import { eventRoutes } from "./routes/events";
import { AiChatSessionAgent } from "./agents/ai-chat-session-agent";

const app = new Hono<{ Bindings: Env }>();

// CORS middleware — allow all origins in dev, restrict in production
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow the custom scheme, localhost dev, and any origin for now
      if (!origin) return "harmoniq://";
      return origin;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.use("/api/*", errorHandler);

// Better Auth handler — mounted before auth middleware so /api/auth/* is accessible without authentication
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, c.executionCtx, c.req.url);
  // Clone the request to avoid "Can't modify immutable headers" error
  // that occurs when the expo plugin tries to mutate headers
  const clonedRequest = new Request(c.req.raw.url, c.req.raw);
  return auth.handler(clonedRequest);
});

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

// Auth middleware — protects all API routes except /api/auth/*
app.use("/api/accounts/*", authMiddleware);
app.use("/api/categories/*", authMiddleware);
app.use("/api/transactions/*", authMiddleware);
app.use("/api/profile/*", authMiddleware);
app.use("/api/dashboard/*", authMiddleware);
app.use("/api/budgets/*", authMiddleware);
app.use("/api/habits/*", authMiddleware);
app.use("/api/notes/*", authMiddleware);
app.use("/api/events/*", authMiddleware);
app.use("/api/ai/*", authMiddleware);
app.use("/api/admin/*", authMiddleware);
app.use("/api/admin/*", adminMiddleware);

app.route("/api/accounts", accountRoutes);
app.route("/api/categories", categoryRoutes);
app.route("/api/transactions", transactionRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/budgets", budgetRoutes);
app.route("/api/habits", habitRoutes);
app.route("/api/notes", noteRoutes);
app.route("/api/events", eventRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/admin/users", adminUserRoutes);

export { AiChatSessionAgent };
export default app;
