import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, afterEach, describe, it } from "node:test";
import {
  accessTokenNeedsRefresh,
  exchangeGoogleAuthorizationCode,
  GoogleOAuthExchangeError,
  GoogleTokenRefreshError,
  refreshGoogleAccessToken,
} from "./google";
import {
  createGoogleAccessTokenResolver,
  GoogleNotConnectedError,
  withGoogleAccessToken,
} from "./google-access";
import { GoogleSheetsError } from "./google-worksheets";
import { prisma } from "./prisma";

const originalFetch = globalThis.fetch;
const originalEnv = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
};
const createdEmails: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.GOOGLE_CLIENT_ID = originalEnv.clientId;
  process.env.GOOGLE_CLIENT_SECRET = originalEnv.clientSecret;
  process.env.GOOGLE_REDIRECT_URI = originalEnv.redirectUri;
});

function useTestOAuthConfig() {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_REDIRECT_URI =
    "http://localhost:3000/api/auth/google/callback";
}

function assertNoTestSecret(value: string) {
  if (
    value.includes("test-client-secret") ||
    value.includes("kept-refresh-token") ||
    value.includes("ya29.")
  ) {
    throw new Error("Google error included a credential.");
  }
}

function tokenJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Google token exchange and refresh", { concurrency: 1 }, () => {
  it("treats an access token as expired inside the refresh window", () => {
    const now = Date.parse("2026-10-14T10:00:00.000Z");
    assert.equal(
      accessTokenNeedsRefresh(new Date(now + 30_000), now),
      true,
    );
    assert.equal(
      accessTokenNeedsRefresh(new Date(now - 1_000), now),
      true,
    );
    assert.equal(
      accessTokenNeedsRefresh(new Date(now + 120_000), now),
      false,
    );
  });

  it("exchanges an authorization code and omits a missing refresh token", async () => {
    useTestOAuthConfig();
    const seen: string[] = [];
    globalThis.fetch = async (input, init) => {
      const body = String(init?.body ?? "");
      seen.push(body);
      assert.equal(String(input), "https://oauth2.googleapis.com/token");
      assert.equal(init?.method, "POST");
      assert.equal(body.includes("test-client-secret"), true);
      assert.equal(String(input).includes("test-client-secret"), false);
      return tokenJson({
        access_token: "exchanged-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      });
    };

    const tokens = await exchangeGoogleAuthorizationCode("auth-code");
    assert.equal(tokens.accessToken, "exchanged-access-token");
    assert.equal(tokens.refreshToken, null);
    assert.equal(tokens.expiresAt.getTime() > Date.now(), true);
    assert.equal(seen.length, 1);
    assertNoTestSecret(JSON.stringify({ refresh: tokens.refreshToken }));
  });

  it("keeps provider failures free of the client secret", async () => {
    useTestOAuthConfig();
    globalThis.fetch = async () =>
      tokenJson({ error: "invalid_grant" }, 400);

    await assert.rejects(
      () => exchangeGoogleAuthorizationCode("auth-code"),
      (error: unknown) => {
        assert.equal(error instanceof GoogleOAuthExchangeError, true);
        if (error instanceof GoogleOAuthExchangeError) {
          assert.equal(error.googleError, "invalid_grant");
          assert.equal(error.httpStatus, 400);
          assertNoTestSecret(`${error.name} ${error.message} ${error.googleError}`);
        }
        return true;
      },
    );

    globalThis.fetch = async () => {
      throw new TypeError("network down");
    };
    await assert.rejects(
      () => exchangeGoogleAuthorizationCode("auth-code"),
      (error: unknown) => {
        assert.equal(error instanceof GoogleOAuthExchangeError, true);
        if (error instanceof GoogleOAuthExchangeError) {
          assert.equal(error.googleError, "network");
          assertNoTestSecret(error.message);
        }
        return true;
      },
    );

    globalThis.fetch = async () =>
      new Response("not-json", { status: 200 });
    await assert.rejects(
      () => exchangeGoogleAuthorizationCode("auth-code"),
      (error: unknown) => {
        assert.equal(error instanceof GoogleOAuthExchangeError, true);
        if (error instanceof GoogleOAuthExchangeError) {
          assert.equal(error.googleError, "invalid_json");
        }
        return true;
      },
    );

    globalThis.fetch = async () =>
      tokenJson({ access_token: "", token_type: "Bearer", expires_in: 3600 });
    await assert.rejects(
      () => exchangeGoogleAuthorizationCode("auth-code"),
      GoogleOAuthExchangeError,
    );
  });

  it("preserves the stored refresh token when Google does not replace it", async () => {
    useTestOAuthConfig();
    globalThis.fetch = async () =>
      tokenJson({
        access_token: "refreshed-access-token",
        token_type: "Bearer",
        expires_in: 1800,
      });

    const tokens = await refreshGoogleAccessToken("kept-refresh-token");
    assert.equal(tokens.accessToken, "refreshed-access-token");
    assert.equal(tokens.refreshToken, "kept-refresh-token");

    globalThis.fetch = async () =>
      tokenJson({
        access_token: "replaced-access-token",
        refresh_token: "replacement-refresh-token",
        token_type: "Bearer",
        expires_in: 1800,
      });
    const replaced = await refreshGoogleAccessToken("kept-refresh-token");
    assert.equal(replaced.refreshToken, "replacement-refresh-token");
  });

  it("classifies refresh failures, including invalid_grant", async () => {
    useTestOAuthConfig();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return tokenJson({ error: "invalid_grant" }, 400);
    };

    await assert.rejects(
      () => refreshGoogleAccessToken(""),
      (error: unknown) => {
        assert.equal(error instanceof GoogleTokenRefreshError, true);
        if (error instanceof GoogleTokenRefreshError) {
          assert.equal(error.reauthRequired, true);
        }
        return true;
      },
    );
    assert.equal(calls, 0);

    await assert.rejects(
      () => refreshGoogleAccessToken("kept-refresh-token"),
      (error: unknown) => {
        assert.equal(error instanceof GoogleTokenRefreshError, true);
        if (error instanceof GoogleTokenRefreshError) {
          assert.equal(error.reauthRequired, true);
          assert.equal(error.message.includes("kept-refresh-token"), false);
          assertNoTestSecret(error.message);
        }
        return true;
      },
    );

    globalThis.fetch = async () => tokenJson({ error: "temporarily_unavailable" }, 503);
    await assert.rejects(
      () => refreshGoogleAccessToken("kept-refresh-token"),
      (error: unknown) => {
        assert.equal(error instanceof GoogleTokenRefreshError, true);
        if (error instanceof GoogleTokenRefreshError) {
          assert.equal(error.reauthRequired, false);
        }
        return true;
      },
    );

    globalThis.fetch = async () => {
      throw new TypeError("network down");
    };
    await assert.rejects(
      () => refreshGoogleAccessToken("kept-refresh-token"),
      (error: unknown) => {
        assert.equal(error instanceof GoogleTokenRefreshError, true);
        if (error instanceof GoogleTokenRefreshError) {
          assert.equal(error.reauthRequired, false);
        }
        return true;
      },
    );

    globalThis.fetch = async () => new Response("not-json", { status: 200 });
    await assert.rejects(
      () => refreshGoogleAccessToken("kept-refresh-token"),
      (error: unknown) => {
        assert.equal(error instanceof GoogleTokenRefreshError, true);
        if (error instanceof GoogleTokenRefreshError) {
          assert.equal(error.reauthRequired, false);
        }
        return true;
      },
    );
  });

  it("stores a refreshed access token and the previous refresh token", async () => {
    useTestOAuthConfig();
    const email = `google-token-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
    createdEmails.push(email);
    const user = await prisma.user.create({
      data: { name: "Token user", email, password: "not-used" },
    });
    await prisma.googleConnection.create({
      data: {
        userId: user.id,
        googleAccountId: `google-${user.id}`,
        accessToken: "old-access-token",
        refreshToken: "kept-refresh-token",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    globalThis.fetch = async () =>
      tokenJson({
        access_token: "refreshed-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      });

    const resolver = createGoogleAccessTokenResolver({
      userId: user.id,
      accessToken: "old-access-token",
      refreshToken: "kept-refresh-token",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const accessToken = await resolver.resolve();
    const stored = await prisma.googleConnection.findUnique({
      where: { userId: user.id },
    });

    assert.equal(resolver.didRefresh, true);
    assert.equal(accessToken, "refreshed-access-token");
    assert.equal(stored?.accessToken, "refreshed-access-token");
    assert.equal(stored?.refreshToken, "kept-refresh-token");
  });

  it("leaves the stored connection unchanged when refresh is rejected", async () => {
    useTestOAuthConfig();
    const email = `google-token-fail-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
    createdEmails.push(email);
    const user = await prisma.user.create({
      data: { name: "Token failure", email, password: "not-used" },
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.googleConnection.create({
      data: {
        userId: user.id,
        googleAccountId: `google-${user.id}`,
        accessToken: "old-access-token",
        refreshToken: "kept-refresh-token",
        expiresAt,
      },
    });

    let tokenCalls = 0;
    globalThis.fetch = async (input) => {
      const url = String(input);

      if (url.includes("oauth2.googleapis.com/token")) {
        tokenCalls += 1;
        return tokenJson({ error: "invalid_grant" }, 400);
      }

      return tokenJson(
        { error: { errors: [{ reason: "authError" }] } },
        401,
      );
    };

    await assert.rejects(
      () =>
        withGoogleAccessToken(user.id, async () => {
          throw new GoogleSheetsError(401, "reauth");
        }),
      (error: unknown) => {
        assert.equal(error instanceof GoogleTokenRefreshError, true);
        if (error instanceof GoogleTokenRefreshError) {
          assert.equal(error.reauthRequired, true);
          assertNoTestSecret(error.message);
        }
        return true;
      },
    );

    const stored = await prisma.googleConnection.findUnique({
      where: { userId: user.id },
    });
    assert.equal(tokenCalls, 1);
    assert.equal(stored?.accessToken, "old-access-token");
    assert.equal(stored?.refreshToken, "kept-refresh-token");

    await prisma.googleConnection.update({
      where: { userId: user.id },
      data: { refreshToken: null },
    });
    tokenCalls = 0;
    await assert.rejects(
      () =>
        withGoogleAccessToken(user.id, async () => {
          throw new GoogleSheetsError(401, "reauth");
        }),
      (error: unknown) => error instanceof GoogleSheetsError,
    );
    assert.equal(tokenCalls, 0);

    await prisma.googleConnection.delete({ where: { userId: user.id } });
    await assert.rejects(
      () => withGoogleAccessToken(user.id, async () => "unused"),
      GoogleNotConnectedError,
    );
  });

  it("refreshes once after Google rejects a still-current access token", async () => {
    useTestOAuthConfig();
    const email = `google-token-retry-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
    createdEmails.push(email);
    const user = await prisma.user.create({
      data: { name: "Token retry", email, password: "not-used" },
    });
    await prisma.googleConnection.create({
      data: {
        userId: user.id,
        googleAccountId: `google-${user.id}`,
        accessToken: "old-access-token",
        refreshToken: "kept-refresh-token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const seenTokens: string[] = [];
    globalThis.fetch = async () =>
      tokenJson({
        access_token: "retried-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      });

    let attempts = 0;
    const result = await withGoogleAccessToken(user.id, async (accessToken) => {
      seenTokens.push(accessToken);
      attempts += 1;

      if (attempts === 1) {
        throw new GoogleSheetsError(401, "reauth");
      }

      return "sheet-ok";
    });
    const stored = await prisma.googleConnection.findUnique({
      where: { userId: user.id },
    });

    assert.equal(result, "sheet-ok");
    assert.deepEqual(seenTokens, ["old-access-token", "retried-access-token"]);
    assert.equal(stored?.refreshToken, "kept-refresh-token");
    assert.equal(stored?.accessToken, "retried-access-token");
  });

  it("asks Google to reject an unknown refresh token without changing the saved connection", async (t) => {
    if (!originalEnv.clientId || !originalEnv.clientSecret) {
      t.skip("blocked: Google OAuth client configuration is missing");
      return;
    }

    const saved = await prisma.googleConnection.findFirst({
      select: {
        userId: true,
        refreshToken: true,
        accessToken: true,
        updatedAt: true,
      },
    });
    const before = saved
      ? {
          userId: saved.userId,
          refreshHash: createHash("sha256")
            .update(saved.refreshToken ?? "")
            .digest("hex"),
          accessHash: createHash("sha256").update(saved.accessToken).digest("hex"),
          updatedAt: saved.updatedAt.getTime(),
        }
      : null;

    await assert.rejects(
      () => refreshGoogleAccessToken("bogus-refresh-token-not-stored"),
      (error: unknown) => {
        assert.equal(error instanceof GoogleTokenRefreshError, true);
        if (error instanceof GoogleTokenRefreshError) {
          assert.equal(error.reauthRequired, true);
          assert.equal(error.message.includes("bogus-refresh-token-not-stored"), false);
          assert.equal(
            originalEnv.clientSecret
              ? error.message.includes(originalEnv.clientSecret)
              : false,
            false,
          );
        }
        return true;
      },
    );

    if (!before) {
      t.diagnostic("live invalid_grant ran with no stored Google connection");
      return;
    }

    const after = await prisma.googleConnection.findUnique({
      where: { userId: before.userId },
      select: { refreshToken: true, accessToken: true, updatedAt: true },
    });
    assert.equal(
      createHash("sha256")
        .update(after?.refreshToken ?? "")
        .digest("hex"),
      before.refreshHash,
    );
    assert.equal(
      createHash("sha256")
        .update(after?.accessToken ?? "")
        .digest("hex"),
      before.accessHash,
    );
    assert.equal(after?.updatedAt.getTime(), before.updatedAt);
    t.diagnostic("live invalid_grant left the stored Google connection unchanged");
  });
});

after(async () => {
  if (createdEmails.length > 0) {
    await prisma.user.deleteMany({
      where: { email: { in: createdEmails } },
    });
  }

  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});
