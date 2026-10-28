import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { cookiesMustUseSecureFlag } from "./secure-cookies";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ALLOW = process.env.ALLOW_INSECURE_COOKIES;
const env = process.env as Record<string, string | undefined>;

afterEach(() => {
  env.NODE_ENV = ORIGINAL_NODE_ENV;

  if (ORIGINAL_ALLOW === undefined) {
    delete process.env.ALLOW_INSECURE_COOKIES;
  } else {
    process.env.ALLOW_INSECURE_COOKIES = ORIGINAL_ALLOW;
  }
});

describe("secure cookies", () => {
  it("requires Secure cookies in production", () => {
    env.NODE_ENV = "production";
    delete process.env.ALLOW_INSECURE_COOKIES;
    assert.equal(cookiesMustUseSecureFlag(), true);
  });

  it("does not silently allow insecure cookies in production", () => {
    env.NODE_ENV = "production";
    process.env.ALLOW_INSECURE_COOKIES = "true";
    assert.throws(() => cookiesMustUseSecureFlag(), /ALLOW_INSECURE_COOKIES/);
  });

  it("allows non-Secure cookies outside production for local HTTP", () => {
    env.NODE_ENV = "development";
    delete process.env.ALLOW_INSECURE_COOKIES;
    assert.equal(cookiesMustUseSecureFlag(), false);
  });
});
