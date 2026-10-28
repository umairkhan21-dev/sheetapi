import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  isSealedSecret,
  openSecret,
  resetTokenEncryptionKeyCacheForTests,
  sealSecret,
} from "./token-crypto";

const ORIGINAL_KEY = process.env.TOKEN_ENCRYPTION_KEY;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const env = process.env as Record<string, string | undefined>;

afterEach(() => {
  resetTokenEncryptionKeyCacheForTests();

  if (ORIGINAL_KEY === undefined) {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
  }

  env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("token-crypto", () => {
  it("leaves values unsealed when TOKEN_ENCRYPTION_KEY is unset outside production", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    env.NODE_ENV = "test";
    resetTokenEncryptionKeyCacheForTests();

    const sealed = sealSecret("ya29.plaintext-token");
    assert.equal(sealed, "ya29.plaintext-token");
    assert.equal(isSealedSecret(sealed), false);
    assert.equal(openSecret(sealed), "ya29.plaintext-token");
  });

  it("round-trips AES-256-GCM sealed secrets without logging plaintext", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    env.NODE_ENV = "test";
    resetTokenEncryptionKeyCacheForTests();

    const plaintext = "ya29.test-access-token-value";
    const sealed = sealSecret(plaintext);

    assert.equal(isSealedSecret(sealed), true);
    assert.equal(sealed.includes(plaintext), false);
    assert.equal(openSecret(sealed), plaintext);
    assert.notEqual(sealSecret(plaintext), sealed);
  });

  it("opens legacy plaintext beside sealed values for migration", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "b".repeat(64);
    env.NODE_ENV = "test";
    resetTokenEncryptionKeyCacheForTests();

    assert.equal(openSecret("legacy-refresh-token"), "legacy-refresh-token");
    assert.equal(openSecret(sealSecret("fresh-token")), "fresh-token");
  });

  it("rejects a weak or missing key in production", () => {
    env.NODE_ENV = "production";
    delete process.env.TOKEN_ENCRYPTION_KEY;
    resetTokenEncryptionKeyCacheForTests();

    assert.throws(() => sealSecret("token"), /TOKEN_ENCRYPTION_KEY/);

    process.env.TOKEN_ENCRYPTION_KEY = "too-short";
    resetTokenEncryptionKeyCacheForTests();
    assert.throws(() => sealSecret("token"), /TOKEN_ENCRYPTION_KEY/);
  });
});
