const PROD_URL = "https://harmoniq-backend.aliahad.workers.dev";

function hasScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
}

export function resolveApiBaseUrl(rawValue: string | undefined): string {
  const trimmed = rawValue?.trim() ?? "";
  // Keep production stable: release builds always use Cloudflare URL.
  // Env override is only for local/dev workflows.
  const canUseEnvOverride = typeof __DEV__ === "boolean" ? __DEV__ : true;
  const candidate = canUseEnvOverride && trimmed.length > 0 ? trimmed : PROD_URL;
  const normalized = hasScheme(candidate) ? candidate : `https://${candidate}`;

  try {
    const parsed = new URL(normalized);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return PROD_URL;
  }
}

export { PROD_URL };
