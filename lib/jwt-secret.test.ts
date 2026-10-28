import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import {
  getJwtSecret,
  resetJwtSecretCacheForTests,
} from "./jwt-secret";

const ORIGINAL_SECRET = process.env.JWT_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const env = process.env as Record<string, string | undefined>;

afterEach(() => {
  resetJwtSecretCacheForTests();

  if (ORIGINAL_SECRET === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = ORIGINAL_SECRET;
  }

  env.NODE_ENV = ORIGINAL_NODE_ENV;
});

function signedToken(userId: number, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: String(userId), iat: now, exp: now + 60 }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

describe("JWT_SECRET validation", () => {
  it("accepts a strong secret", () => {
    env.NODE_ENV = "test";
    process.env.JWT_SECRET = "local-dev-secret-with-enough-length";
    resetJwtSecretCacheForTests();

    const secret = getJwtSecret();
    assert.equal(secret.length >= 32, true);
    assert.equal(signedToken(42, secret).split(".").length, 3);
  });

  it("rejects missing and weak secrets in production", () => {
    env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    resetJwtSecretCacheForTests();
    assert.throws(() => getJwtSecret(), /JWT_SECRET is not set/);

    process.env.JWT_SECRET = "short";
    resetJwtSecretCacheForTests();
    assert.throws(() => getJwtSecret(), /at least 32 characters/);

    process.env.JWT_SECRET = "secret";
    resetJwtSecretCacheForTests();
    assert.throws(() => getJwtSecret(), /too weak|at least 32/);

    process.env.JWT_SECRET = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    resetJwtSecretCacheForTests();
    assert.throws(() => getJwtSecret(), /entropy/);
  });
});
