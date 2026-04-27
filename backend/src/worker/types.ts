/** Shared Hono app environment — all protected routes use this type */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: { id: string; name: string; email: string; role?: string };
    session: { id: string; userId: string; token: string };
  };
};
