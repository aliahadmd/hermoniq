import type { Context, Next } from "hono";
import { ZodError } from "zod";

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    if (err instanceof ZodError) {
      return c.json(
        { error: "Validation error", details: err.issues },
        400
      );
    }

    if (err instanceof SyntaxError) {
      return c.json({ error: "Invalid request body" }, 400);
    }

    if (err instanceof Error && err.message === "Not found") {
      return c.json({ error: err.message }, 404);
    }

    console.error("Unexpected error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
}
