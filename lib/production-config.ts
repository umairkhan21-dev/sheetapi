import { getAppUrl, assertEmailTransportConfigured } from "@/lib/email";
import { getGooglePickerConfig } from "@/lib/google-picker";
import { getJwtSecret } from "@/lib/jwt-secret";
import { cookiesMustUseSecureFlag } from "@/lib/secure-cookies";
import { assertTokenEncryptionConfiguredForProduction } from "@/lib/token-crypto";

const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

/**
 * Checks production configuration before the server accepts requests.
 * Outside production this is a no-op so local development keeps its defaults.
 * Errors name the variable only and never include secret values.
 */
export function assertProductionConfig() {
  const problems = productionConfigProblems();

  if (problems.length > 0) {
    throw new Error(
      `Production configuration is invalid: ${problems.join("; ")}`,
    );
  }
}

export function productionConfigProblems() {
  if (process.env.NODE_ENV !== "production") {
    return [];
  }

  const problems: string[] = [];

  collect(problems, () => {
    getJwtSecret();
  });
  collect(problems, () => {
    assertTokenEncryptionConfiguredForProduction();
  });

  let appUrl: string | null = null;

  collect(problems, () => {
    appUrl = getAppUrl();
  });
  problems.push(...googleProblems(appUrl));
  collect(problems, () => {
    getGooglePickerConfig();
  });
  collect(problems, () => {
    assertDatabaseUrl();
  });
  collect(problems, () => {
    assertEmailTransportConfigured();
  });
  collect(problems, () => {
    cookiesMustUseSecureFlag();
  });
  collect(problems, () => {
    assertRateLimitingStaysEnabled();
  });
  collect(problems, () => {
    assertTrustedProxyHopSetting();
  });

  return problems;
}

function collect(problems: string[], check: () => void) {
  try {
    check();
  } catch (error) {
    problems.push(publicConfigMessage(error));
  }
}

function publicConfigMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";

  if (message.length === 0 || message.length > 200 || /[\r\n]/.test(message)) {
    return "Production configuration is invalid";
  }

  return message;
}

function googleProblems(appUrl: string | null) {
  const problems: string[] = [];
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() ?? "";

  if (!clientId) {
    problems.push("GOOGLE_CLIENT_ID is not set");
  } else if (clientId.length > 256 || /\s/.test(clientId)) {
    problems.push("GOOGLE_CLIENT_ID is invalid");
  }

  if (!clientSecret) {
    problems.push("GOOGLE_CLIENT_SECRET is not set");
  } else if (
    clientSecret.length < 16 ||
    clientSecret.length > 512 ||
    /\s/.test(clientSecret)
  ) {
    problems.push("GOOGLE_CLIENT_SECRET is invalid");
  }

  if (!redirectUri) {
    problems.push("GOOGLE_REDIRECT_URI is not set");
    return problems;
  }

  let redirect: URL;

  try {
    redirect = new URL(redirectUri);
  } catch {
    problems.push("GOOGLE_REDIRECT_URI is invalid");
    return problems;
  }

  if (redirect.protocol !== "https:") {
    problems.push("GOOGLE_REDIRECT_URI must use https");
    return problems;
  }

  if (
    redirect.username !== "" ||
    redirect.password !== "" ||
    redirect.search !== "" ||
    redirect.hash !== ""
  ) {
    problems.push("GOOGLE_REDIRECT_URI is invalid");
    return problems;
  }

  if (!appUrl) {
    problems.push("GOOGLE_REDIRECT_URI must match APP_URL");
    return problems;
  }

  const expected = new URL(GOOGLE_CALLBACK_PATH, `${appUrl}/`);

  if (
    redirect.origin !== expected.origin ||
    redirect.pathname !== expected.pathname
  ) {
    problems.push("GOOGLE_REDIRECT_URI must be the https APP_URL callback");
  }

  return problems;
}

function assertDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim() ?? "";

  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is invalid");
  }

  const port = url.port === "" ? 3306 : Number(url.port);
  let databaseName = "";

  try {
    databaseName =
      decodeURIComponent(url.pathname.replace(/^\/+/, "")).split("/")[0] ?? "";
  } catch {
    throw new Error("DATABASE_URL is invalid");
  }

  if (
    (url.protocol !== "mysql:" && url.protocol !== "mariadb:") ||
    url.hostname === "" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    databaseName === ""
  ) {
    throw new Error("DATABASE_URL is invalid");
  }

  if (url.username === "" || url.password === "") {
    throw new Error("DATABASE_URL must include a database user and password");
  }
}

function assertRateLimitingStaysEnabled() {
  const raw = process.env.RATE_LIMIT_DISABLED?.trim();

  if (raw === "true" || raw === "1") {
    throw new Error("RATE_LIMIT_DISABLED cannot be enabled in production");
  }
}

function assertTrustedProxyHopSetting() {
  const raw = process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS?.trim() ?? "";

  if (raw !== "" && !/^[0-5]$/.test(raw)) {
    throw new Error("RATE_LIMIT_TRUSTED_PROXY_HOPS is invalid");
  }
}
