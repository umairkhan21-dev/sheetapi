import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  API_KEY_PREFIX,
  generateApiKey,
  hashApiKey,
  presentedKeyIsUsable,
  readApiKeyName,
  readBearerApiKey,
  readRouteId,
} from "./api-key";

describe("API key generation", () => {
  it("creates a recognizable key with enough entropy and a short prefix", () => {
    const first = generateApiKey();
    const second = generateApiKey();

    assert.match(first.secret, /^sk_live_[A-Za-z0-9_-]{43}$/);
    assert.equal(first.secret.startsWith(API_KEY_PREFIX), true);
    assert.equal(first.keyPrefix.length, API_KEY_PREFIX.length + 8);
    assert.equal(first.secret.startsWith(first.keyPrefix), true);
    assert.notEqual(first.secret, first.keyPrefix);
    assert.notEqual(first.secret, second.secret);
    assert.equal(first.keyHash, hashApiKey(first.secret));
    assert.match(first.keyHash, /^[a-f0-9]{64}$/);
    assert.equal(first.keyHash.includes(first.secret), false);
    assert.notEqual(first.keyHash, first.secret);
  });

  it("hashes the same key to the same value", () => {
    const generated = generateApiKey();

    assert.equal(hashApiKey(generated.secret), generated.keyHash);
    assert.equal(hashApiKey(generated.secret), hashApiKey(generated.secret));
  });
});

describe("API key request parsing", () => {
  it("accepts only a bearer key with the expected shape", () => {
    const generated = generateApiKey();
    const parsed = readBearerApiKey(`Bearer ${generated.secret}`);

    assert.equal(parsed.ok, true);

    if (parsed.ok) {
      assert.equal(parsed.secret, generated.secret);
    }

    assert.deepEqual(readBearerApiKey(`bearer ${generated.secret}`), {
      ok: true,
      secret: generated.secret,
    });
    assert.deepEqual(readBearerApiKey(null), { ok: false, reason: "missing" });
    assert.deepEqual(readBearerApiKey("   "), { ok: false, reason: "missing" });
    assert.deepEqual(readBearerApiKey(`Basic ${generated.secret}`), {
      ok: false,
      reason: "malformed",
    });
    assert.deepEqual(readBearerApiKey("Bearer"), {
      ok: false,
      reason: "malformed",
    });
    assert.deepEqual(readBearerApiKey(`Bearer ${generated.secret} extra`), {
      ok: false,
      reason: "malformed",
    });
    assert.deepEqual(readBearerApiKey("Bearer sk_live_too-short"), {
      ok: false,
      reason: "malformed",
    });
    assert.deepEqual(readBearerApiKey(`Bearer SK_LIVE_${"a".repeat(43)}`), {
      ok: false,
      reason: "malformed",
    });
  });

  it("validates key names and numeric ids", () => {
    assert.equal(readApiKeyName("  Website key  "), "Website key");
    assert.equal(readApiKeyName("bad\nname"), null);
    assert.equal(readApiKeyName(""), null);
    assert.equal(readApiKeyName(12), null);
    assert.equal(readRouteId("12"), 12);
    assert.equal(readRouteId("0"), null);
    assert.equal(readRouteId("01"), null);
    assert.equal(readRouteId("2147483648"), null);
    assert.equal(readRouteId("1abc"), null);
  });
});

describe("API key comparison", () => {
  it("accepts a matching active key for the requested API", () => {
    const generated = generateApiKey();

    assert.equal(
      presentedKeyIsUsable(generated.keyHash, 4, {
        apiId: 4,
        keyHash: generated.keyHash,
        revokedAt: null,
      }),
      true,
    );
  });

  it("rejects a missing, different, revoked, or other-API key", () => {
    const generated = generateApiKey();
    const other = generateApiKey();
    const stored = {
      apiId: 4,
      keyHash: generated.keyHash,
      revokedAt: null,
    };

    assert.equal(presentedKeyIsUsable(other.keyHash, 4, stored), false);
    assert.equal(presentedKeyIsUsable(generated.keyHash, 9, stored), false);
    assert.equal(
      presentedKeyIsUsable(generated.keyHash, 4, {
        ...stored,
        revokedAt: new Date(),
      }),
      false,
    );
    assert.equal(presentedKeyIsUsable(generated.keyHash, 4, null), false);
    assert.equal(presentedKeyIsUsable("not-a-hash", 4, stored), false);
  });
});
