import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, emailOTP } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { drizzle } from "drizzle-orm/d1";
import { sendEmail } from "./email";
import * as schema from "../db/schema";
import { generateUniqueUsername } from "../worker/utils/username-generator";

const PROFILE_INSERT_MAX_ATTEMPTS = 3;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isLocalDevelopmentHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) return true;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

export function createAuth(env: Env, ctx?: ExecutionContext, requestUrl?: string) {
  const db = drizzle(env.DB, { schema });

  // Derive baseURL from the incoming request URL so Better Auth can
  // construct callback / redirect URLs correctly on Cloudflare Workers
  // where there is no static hostname.
  const requestURLObject = requestUrl ? new URL(requestUrl) : undefined;
  const baseURL = requestURLObject?.origin;

  const trustedOrigins = new Set<string>([
    "harmoniq://",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
  ]);

  if (requestURLObject && isLocalDevelopmentHost(requestURLObject.hostname)) {
    // Expo dev-client + Metro on LAN during local development.
    trustedOrigins.add(`http://${requestURLObject.hostname}:8081`);
    trustedOrigins.add("exp://");
    trustedOrigins.add("exp://**");
    trustedOrigins.add("exp+harmoniq://");
    trustedOrigins.add("exp+harmoniq://**");
  }

  return betterAuth({
    baseURL,
    basePath: "/api/auth",
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        ...schema,
        account: schema.authAccount,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    plugins: [
      admin({
        defaultRole: "user",
      }),
      expo(),
      emailOTP({
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP({ email, otp, type }) {
          if (type === "email-verification") {
            const emailPromise = sendEmail({
              to: email,
              subject: "Your Harmoniq verification code",
              html: `<p>Your verification code is: <strong>${otp}</strong></p><p>Enter this code in the app to verify your email.</p>`,
              env,
            });
            if (ctx) {
              ctx.waitUntil(emailPromise);
            } else {
              void emailPromise;
            }
          }
        },
      }),
    ],
    trustedOrigins: Array.from(trustedOrigins),
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "user",
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Profile bootstrap is a side effect and must never block account creation.
            try {
              for (let attempt = 0; attempt < PROFILE_INSERT_MAX_ATTEMPTS; attempt += 1) {
                const username = await generateUniqueUsername(db);
                try {
                  await db.insert(schema.profiles).values({
                    name: user.name,
                    username,
                    userId: user.id,
                  });
                  return;
                } catch (error) {
                  const message = getErrorMessage(error);
                  const isUsernameConflict =
                    message.includes("UNIQUE constraint failed: profiles.username");
                  const isUserConflict =
                    message.includes("UNIQUE constraint failed: profiles.user_id");

                  // If another concurrent flow already created the profile, treat as success.
                  if (isUserConflict) {
                    return;
                  }

                  // Retry with a new generated username on rare collisions.
                  if (isUsernameConflict && attempt < PROFILE_INSERT_MAX_ATTEMPTS - 1) {
                    continue;
                  }

                  throw error;
                }
              }
            } catch (error) {
              // Better Auth treats hook errors as sign-up failures (FAILED_TO_CREATE_USER).
              // Keep registration successful even if profile bootstrap fails.
              console.error("Profile bootstrap failed after user registration", {
                userId: user.id,
                email: user.email,
                error: getErrorMessage(error),
              });
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
