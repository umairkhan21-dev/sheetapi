import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, describe, it } from "node:test";
import bcrypt from "bcrypt";
import {
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_OAUTH_STATE_COOKIE,
  buildGoogleAuthorizationUrl,
  createOAuthState,
  oauthStatesMatch,
} from "./google";
import { prisma } from "./prisma";

const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Oauth-${stamp}-pass`;
const email = `google-oauth-${stamp}@example.com`;
const baseUrl = "http://127.0.0.1:3000";

function configured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI,
  );
}

function assertNoOAuthCredential(value: string) {
  const secret = process.env.GOOGLE_CLIENT_SECRET ?? "";

  if (
    (secret.length > 0 && value.includes(secret)) ||
    value.includes("refresh_token") ||
    value.includes("access_token")
  ) {
    throw new Error("OAuth response included a credential.");
  }
}

function callbackReason(response: Response) {
  assert.equal(response.status, 302);
  const location = response.headers.get("location") ?? "";
  assertNoOAuthCredential(location);
  return new URL(location, baseUrl).searchParams.get("reason");
}

function assertSafeOAuthRedirect(response: Response) {
  const location = new URL(response.headers.get("location") ?? "", baseUrl);
  assert.equal(location.pathname, "/dashboard");
  assert.equal(location.searchParams.get("google"), "error");
  assert.deepEqual([...location.searchParams.keys()].sort(), ["google", "reason"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const cleared = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${GOOGLE_OAUTH_STATE_COOKIE}=`));
  assert.equal(cleared?.split(";")[0], `${GOOGLE_OAUTH_STATE_COOKIE}=`);
  assertNoOAuthCredential(cleared ?? "");
}

async function beginGoogleConnect(session: string) {
  const start = await fetch(`${baseUrl}/api/auth/google`, {
    headers: { cookie: session },
    redirect: "manual",
  });
  assert.equal(start.status, 302);
  const location = new URL(start.headers.get("location") ?? "", baseUrl);
  const stateCookie = start.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${GOOGLE_OAUTH_STATE_COOKIE}=`));

  const statePair = stateCookie?.split(";")[0] ?? "";
  assertNoOAuthCredential(location.toString());
  assertNoOAuthCredential(statePair);

  return { location, statePair };
}

async function callbackWithState(
  session: string,
  started: { location: URL; statePair: string },
  params: { error?: string; code?: string },
) {
  const state = started.location.searchParams.get("state") ?? "";
  const query = new URLSearchParams({ state });

  if (params.error) {
    query.set("error", params.error);
  }

  if (params.code) {
    query.set("code", params.code);
  }

  return fetch(`${baseUrl}/api/auth/google/callback?${query.toString()}`, {
    headers: { cookie: `${session}; ${started.statePair}` },
    redirect: "manual",
  });
}

describe("Google OAuth connection", () => {
  it("creates an unguessable state and keeps the client secret out of the authorization URL", (t) => {
    const state = createOAuthState();
    assert.equal(state.length >= 32, true);
    assert.equal(oauthStatesMatch(state, state), true);
    assert.equal(oauthStatesMatch(state, `${state}x`), false);

    if (!configured()) {
      t.skip("blocked: Google OAuth client configuration is missing");
      return;
    }

    const url = buildGoogleAuthorizationUrl(state);
    assert.equal(url.origin, "https://accounts.google.com");
    assert.equal(url.searchParams.get("scope"), GOOGLE_DRIVE_FILE_SCOPE);
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("state"), state);
    assert.equal(url.searchParams.has("client_secret"), false);
    assert.equal((url.searchParams.get("client_id") ?? "").length > 0, true);
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
    assert.equal(
      clientSecret.length > 0 && url.toString().includes(clientSecret),
      false,
    );
  });

  it("blocks a signed-out connect and rejects a mismatched callback", async () => {
    const signedOut = await fetch(`${baseUrl}/api/auth/google`, {
      redirect: "manual",
    });
    assert.equal(signedOut.status, 302);
    const signedOutLocation = new URL(signedOut.headers.get("location") ?? "", baseUrl);
    assert.equal(signedOutLocation.pathname, "/dashboard");
    assert.equal(signedOutLocation.searchParams.get("google"), "error");
    assert.equal(signedOutLocation.searchParams.get("reason"), "unauthorized");

    const mismatch = await fetch(
      `${baseUrl}/api/auth/google/callback?state=mismatch&code=not-a-real-code`,
      { redirect: "manual" },
    );
    assert.equal(mismatch.status, 302);
    const mismatchLocation = new URL(mismatch.headers.get("location") ?? "", baseUrl);
    assert.equal(mismatchLocation.searchParams.get("reason"), "invalid");
    assert.equal(
      await prisma.googleConnection.count({
        where: { user: { email } },
      }),
      0,
    );
  });

  it("rejects Google denial without storing a connection", async (t) => {
    const passwordHash = await bcrypt.hash(password, 4);
    await prisma.user.create({
      data: { name: "OAuth User", email, password: passwordHash },
    });

    try {
      const login = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(login.status, 200);
      const session = login.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .find((value) => value?.startsWith("auth_token="));
      assert.ok(session);

      const start = await fetch(`${baseUrl}/api/auth/google`, {
        headers: { cookie: session },
        redirect: "manual",
      });
      assert.equal(start.status, 302);
      const location = new URL(start.headers.get("location") ?? "", baseUrl);
      const stateCookie = start.headers
        .getSetCookie()
        .find((value) => value.startsWith(`${GOOGLE_OAUTH_STATE_COOKIE}=`));

      if (location.pathname === "/dashboard") {
        assert.equal(location.searchParams.get("reason"), "failed");
        t.skip("blocked: signed-in Google connect did not reach Google");
        return;
      }

      assert.equal(location.origin, "https://accounts.google.com");
      assert.equal(location.searchParams.get("scope"), GOOGLE_DRIVE_FILE_SCOPE);
      assert.equal(location.searchParams.has("client_secret"), false);
      assert.ok(stateCookie);
      const statePair = stateCookie.split(";")[0] ?? "";
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
      assert.equal(clientSecret.length > 0 && statePair.includes(clientSecret), false);

      const denied = await fetch(
        `${baseUrl}/api/auth/google/callback?error=access_denied&state=${encodeURIComponent(
          location.searchParams.get("state") ?? "",
        )}`,
        {
          headers: { cookie: `${session}; ${statePair}` },
          redirect: "manual",
        },
      );
      assert.equal(denied.status, 302);
      const deniedLocation = new URL(denied.headers.get("location") ?? "", baseUrl);
      assert.equal(deniedLocation.searchParams.get("google"), "error");
      assert.equal(deniedLocation.searchParams.get("reason"), "denied");
      assert.equal(
        await prisma.googleConnection.count({ where: { user: { email } } }),
        0,
      );

      const missingCode = await fetch(
        `${baseUrl}/api/auth/google/callback?state=${encodeURIComponent(
          location.searchParams.get("state") ?? "",
        )}`,
        {
          headers: { cookie: `${session}; ${statePair}` },
          redirect: "manual",
        },
      );
      assert.equal(missingCode.status, 302);
      assert.equal(
        new URL(missingCode.headers.get("location") ?? "", baseUrl).searchParams.get(
          "reason",
        ),
        "invalid",
      );
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  it("rejects a provider error and a bad authorization code without storing tokens", async (t) => {
    const failureEmail = `google-oauth-fail-${stamp}@example.com`;
    const passwordHash = await bcrypt.hash(password, 4);
    await prisma.user.create({
      data: { name: "OAuth Failure", email: failureEmail, password: passwordHash },
    });

    try {
      const login = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: failureEmail, password }),
      });
      assert.equal(login.status, 200);
      const session = login.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .find((value) => value?.startsWith("auth_token="));
      assert.ok(session);

      const duplicated = await fetch(
        `${baseUrl}/api/auth/google/callback?state=one&state=two&code=bad-code`,
        { redirect: "manual" },
      );
      assert.equal(callbackReason(duplicated), "invalid");
      assertNoOAuthCredential(duplicated.headers.get("location") ?? "");

      const oversized = await fetch(
        `${baseUrl}/api/auth/google/callback?state=${"a".repeat(2049)}&code=bad-code`,
        { redirect: "manual" },
      );
      assert.equal(callbackReason(oversized), "invalid");

      const started = await beginGoogleConnect(session);

      if (started.location.pathname === "/dashboard") {
        assert.equal(started.location.searchParams.get("reason"), "failed");
        t.skip("blocked: signed-in Google connect did not reach Google");
        return;
      }

      assert.equal(started.location.origin, "https://accounts.google.com");
      assert.ok(started.statePair);

      const providerError = await callbackWithState(session, started, {
        error: "server_error",
      });
      assert.equal(callbackReason(providerError), "failed");
      assertSafeOAuthRedirect(providerError);

      const restarted = await beginGoogleConnect(session);

      if (!restarted.statePair) {
        t.skip("blocked: Google connect did not issue an OAuth state");
        return;
      }

      const tokenLikeError = await callbackWithState(session, restarted, {
        error: "ya29.not-a-token",
      });
      assert.equal(callbackReason(tokenLikeError), "failed");
      assert.equal(
        (tokenLikeError.headers.get("location") ?? "").includes("ya29"),
        false,
      );
      assertSafeOAuthRedirect(tokenLikeError);

      const forCode = await beginGoogleConnect(session);

      if (!forCode.statePair) {
        t.skip("blocked: Google connect did not issue an OAuth state");
        return;
      }

      const rejectedCode = await callbackWithState(session, forCode, {
        code: "bad-code",
      });
      assert.equal(callbackReason(rejectedCode), "failed");
      assert.equal(
        (rejectedCode.headers.get("location") ?? "").includes("bad-code"),
        false,
      );
      assertSafeOAuthRedirect(rejectedCode);
      assert.equal(
        await prisma.googleConnection.count({
          where: { user: { email: failureEmail } },
        }),
        0,
      );
    } finally {
      await prisma.user.deleteMany({ where: { email: failureEmail } });
    }
  });
});

after(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});
