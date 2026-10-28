import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { register } from "../instrumentation";
import { getAppUrl } from "./email";
import { resetJwtSecretCacheForTests } from "./jwt-secret";
import { assertProductionConfig } from "./production-config";
import { resetTokenEncryptionKeyCacheForTests } from "./token-crypto";

const ENV_KEYS = [
  "NODE_ENV",
  "NEXT_RUNTIME",
  "NEXT_PHASE",
  "JWT_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "APP_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_PICKER_API_KEY",
  "GOOGLE_APP_ID",
  "DATABASE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM",
  "ALLOW_INSECURE_COOKIES",
  "RATE_LIMIT_DISABLED",
  "RATE_LIMIT_TRUSTED_PROXY_HOPS",
] as const;

const ORIGINAL = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);
const env = process.env as Record<string, string | undefined>;

const SECRET_MARKER = "prod-jwt-marker-do-not-print";
const KEY_MARKER = "aa";
const DB_PASSWORD = "db-password-marker-do-not-print";
const GOOGLE_SECRET = "google-secret-marker-value";

afterEach(() => {
  resetJwtSecretCacheForTests();
  resetTokenEncryptionKeyCacheForTests();

  for (const key of ENV_KEYS) {
    const value = ORIGINAL.get(key);

    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
});

function clearConfig() {
  for (const key of ENV_KEYS) {
    if (key !== "NODE_ENV" && key !== "NEXT_PHASE" && key !== "NEXT_RUNTIME") {
      delete env[key];
    }
  }
}

function validProductionEnv() {
  clearConfig();
  env.NODE_ENV = "production";
  env.JWT_SECRET = `${SECRET_MARKER}-and-enough-distinct-characters`;
  env.TOKEN_ENCRYPTION_KEY = KEY_MARKER.repeat(32);
  env.APP_URL = "https://sheetapi.example";
  env.GOOGLE_CLIENT_ID = "123456789012-abc.apps.googleusercontent.com";
  env.GOOGLE_CLIENT_SECRET = GOOGLE_SECRET;
  env.GOOGLE_REDIRECT_URI =
    "https://sheetapi.example/api/auth/google/callback";
  env.GOOGLE_PICKER_API_KEY = `AIza${"a".repeat(30)}`;
  env.GOOGLE_APP_ID = "123456789012";
  env.DATABASE_URL = `mysql://app:${DB_PASSWORD}@db.internal:3306/sheetapi`;
  env.SMTP_HOST = "smtp.example";
  env.SMTP_PORT = "587";
  env.SMTP_USER = "mailer";
  env.SMTP_PASSWORD = "smtp-password-marker";
  env.EMAIL_FROM = "SheetAPI <reset@sheetapi.example>";
}

describe("production configuration", () => {
  it("does nothing outside production", () => {
    clearConfig();
    env.NODE_ENV = "development";

    assert.doesNotThrow(() => assertProductionConfig());
    assert.equal(getAppUrl(), "http://localhost:3000");
  });

  it("accepts a complete production configuration", () => {
    validProductionEnv();
    assert.doesNotThrow(() => assertProductionConfig());
    assert.equal(getAppUrl(), "https://sheetapi.example");
  });

  it("accepts an omitted proxy hop count and an omitted picker project number", () => {
    validProductionEnv();
    delete env.RATE_LIMIT_TRUSTED_PROXY_HOPS;
    delete env.GOOGLE_APP_ID;
    delete env.SMTP_USER;
    delete env.SMTP_PASSWORD;

    assert.doesNotThrow(() => assertProductionConfig());
  });

  it("names missing production settings and does not print secrets", () => {
    clearConfig();
    env.NODE_ENV = "production";
    env.JWT_SECRET = "short-secret-marker";
    env.TOKEN_ENCRYPTION_KEY = "too-short-key-marker";
    env.APP_URL = "http://sheetapi.example";
    env.GOOGLE_REDIRECT_URI = "http://evil.example/api/auth/google/callback";
    env.DATABASE_URL = `postgres://app:${DB_PASSWORD}@db.internal/sheetapi`;
    env.ALLOW_INSECURE_COOKIES = "true";
    env.RATE_LIMIT_DISABLED = "1";
    env.RATE_LIMIT_TRUSTED_PROXY_HOPS = "9";

    const error = assertProductionConfigThrows();
    const message = error.message;

    assert.match(message, /JWT_SECRET/);
    assert.match(message, /TOKEN_ENCRYPTION_KEY/);
    assert.match(message, /APP_URL must use https/);
    assert.match(message, /GOOGLE_CLIENT_ID is not set/);
    assert.match(message, /GOOGLE_CLIENT_SECRET is not set/);
    assert.match(message, /GOOGLE_REDIRECT_URI must use https/);
    assert.match(message, /Google Picker is not configured/);
    assert.match(message, /DATABASE_URL is invalid/);
    assert.match(message, /Email transport is not configured/);
    assert.match(message, /ALLOW_INSECURE_COOKIES/);
    assert.match(message, /RATE_LIMIT_DISABLED/);
    assert.match(message, /RATE_LIMIT_TRUSTED_PROXY_HOPS is invalid/);
    assert.equal(message.includes("short-secret-marker"), false);
    assert.equal(message.includes("too-short-key-marker"), false);
    assert.equal(message.includes(DB_PASSWORD), false);
    assert.equal(message.includes(GOOGLE_SECRET), false);
  });

  it("rejects a mismatched callback, a weak encryption key, and a database URL without credentials", () => {
    validProductionEnv();
    env.GOOGLE_REDIRECT_URI =
      "https://other.example/api/auth/google/callback";
    env.TOKEN_ENCRYPTION_KEY = "zzzz";
    env.DATABASE_URL = "mysql://db.internal:3306/sheetapi";
    resetTokenEncryptionKeyCacheForTests();

    const message = assertProductionConfigThrows().message;

    assert.match(message, /GOOGLE_REDIRECT_URI must be the https APP_URL callback/);
    assert.match(message, /TOKEN_ENCRYPTION_KEY/);
    assert.match(message, /DATABASE_URL must include a database user and password/);
    assert.equal(message.includes(DB_PASSWORD), false);
    assert.equal(message.includes(SECRET_MARKER), false);
    assert.equal(message.includes(KEY_MARKER.repeat(32)), false);
  });

  it("rejects a partial SMTP configuration and a forwarded header injection in the sender", () => {
    validProductionEnv();
    delete env.SMTP_PASSWORD;
    assert.match(
      assertProductionConfigThrows().message,
      /Email transport is not configured/,
    );

    validProductionEnv();
    env.EMAIL_FROM = "reset@sheetapi.example\nBcc: attacker@example.com";
    assert.match(
      assertProductionConfigThrows().message,
      /Email transport is not configured/,
    );
    assert.equal(
      assertProductionConfigThrows().message.includes("attacker@example.com"),
      false,
    );
  });

  it("fails closed from the Node.js server startup hook", async () => {
    clearConfig();
    env.NODE_ENV = "production";
    env.NEXT_RUNTIME = "nodejs";
    delete env.NEXT_PHASE;

    await assert.rejects(register(), /Production configuration is invalid/);
  });

  it("skips startup validation during the production build and outside production", async () => {
    clearConfig();
    env.NODE_ENV = "production";
    env.NEXT_RUNTIME = "nodejs";
    env.NEXT_PHASE = "phase-production-build";
    await assert.doesNotReject(register());

    clearConfig();
    env.NODE_ENV = "development";
    env.NEXT_RUNTIME = "nodejs";
    delete env.NEXT_PHASE;
    await assert.doesNotReject(register());

    clearConfig();
    env.NODE_ENV = "production";
    env.NEXT_RUNTIME = "edge";
    delete env.NEXT_PHASE;
    await assert.doesNotReject(register());
  });
});

function assertProductionConfigThrows() {
  try {
    assertProductionConfig();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error;
  }

  assert.fail("expected production configuration to fail");
}
