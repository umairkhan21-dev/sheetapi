import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcrypt";
import { verifyAuthToken } from "./auth";
import { PASSWORD_RESET_REQUEST_MESSAGE } from "./password";
import { hashResetToken, issuePasswordResetToken } from "./password-reset";
import { prisma } from "./prisma";

async function clearAuthRateLimits() {
  await prisma.$executeRaw`
    DELETE FROM \`RateLimitBucket\`
    WHERE \`id\` LIKE ${"auth:%"}
  `;
}

const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Verify-${stamp}-pass`;
const nextPassword = `Verify-${stamp}-next`;
const baseUrl = "http://127.0.0.1:3000";
const devMailDir = path.join(process.cwd(), "tmp", "dev-mail");
const createdEmails = new Set<string>();

function email(label: string) {
  const value = `verify-${stamp}-${label}@example.com`;
  createdEmails.add(value);
  return value;
}

function signedToken(userId: number, iat: number, exp: number) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: String(userId), iat, exp }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

async function readJson(response: Response) {
  const body: unknown = await response.json();
  return body;
}

function authCookie(response: Response) {
  const header = response.headers
    .getSetCookie()
    .find((value) => value.toLowerCase().startsWith("auth_token="));
  assert.ok(header);
  const [pair, ...attributes] = header.split(";").map((part) => part.trim());
  const value = pair.slice("auth_token=".length);
  assert.equal(value.length > 20, true);
  const flags = attributes.map((attribute) => attribute.toLowerCase());
  assert.equal(
    flags.some((flag) => flag === "httponly"),
    true,
  );
  return { cookie: `auth_token=${value}`, token: value };
}

async function register(body: unknown) {
  return fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function login(address: string, secret: string) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: address, password: secret }),
  });
}

async function currentUser(cookie?: string) {
  const headers = new Headers();

  if (cookie) {
    headers.set("cookie", cookie);
  }

  return fetch(`${baseUrl}/api/auth/me`, { headers, cache: "no-store" });
}

describe("application authentication", () => {
  before(async () => {
    await clearAuthRateLimits();
  });

  it("registers, rejects duplicates and invalid input, and hides the password", async () => {
    const address = email("register");
    const created = await register({
      name: "  Verify User  ",
      email: address.toUpperCase(),
      password,
    });
    const createdBody = await readJson(created);
    assert.equal(created.status, 201);
    assert.equal(typeof createdBody, "object");
    assert.notEqual(createdBody, null);
    const user = (createdBody as { user?: { id?: unknown; name?: unknown; email?: unknown } })
      .user;
    assert.equal(user?.name, "Verify User");
    assert.equal(user?.email, address);
    assert.equal(JSON.stringify(createdBody).includes(password), false);
    assert.equal(JSON.stringify(createdBody).includes("$2"), false);
    const session = authCookie(created);
    assert.equal(JSON.stringify(createdBody).includes(session.token), false);
    const payload = verifyAuthToken(session.token);
    assert.equal(payload?.userId, user?.id);

    const me = await currentUser(session.cookie);
    assert.equal(me.status, 200);
    const meBody = await readJson(me);
    assert.equal(JSON.stringify(meBody).includes(password), false);
    assert.equal(JSON.stringify(meBody).includes("$2"), false);

    const duplicate = await register({
      name: "Second",
      email: `  ${address.toUpperCase()}  `,
      password,
    });
    assert.equal(duplicate.status, 409);
    const duplicateBody = (await readJson(duplicate)) as { error?: unknown };
    assert.equal(duplicateBody.error, "An account with this email already exists.");
    assert.equal(
      await prisma.user.count({ where: { email: address } }),
      1,
    );

    const invalidEmail = await register({
      name: "Verify User",
      email: "not-an-email",
      password,
    });
    assert.equal(invalidEmail.status, 400);

    const shortPassword = await register({
      name: "Verify User",
      email: email("short"),
      password: "short",
    });
    assert.equal(shortPassword.status, 400);
    assert.equal(
      await prisma.user.findUnique({
        where: { email: `verify-${stamp}-short@example.com` },
      }),
      null,
    );
  });

  it("logs in, rejects bad credentials, logs out, and rejects invalid sessions", async () => {
    const address = email("login");
    const passwordHash = await bcrypt.hash(password, 4);
    const user = await prisma.user.create({
      data: {
        name: "Login User",
        email: address,
        password: passwordHash,
      },
    });

    const missing = await currentUser();
    assert.equal(missing.status, 401);

    const wrong = await login(address, "wrong-password");
    assert.equal(wrong.status, 401);
    const wrongBody = (await readJson(wrong)) as { error?: unknown };
    assert.equal(wrongBody.error, "Invalid email or password.");
    assert.equal(
      wrong.headers.getSetCookie().some((value) => value.includes(password)),
      false,
    );

    const unknown = await login(email("missing-user"), password);
    assert.equal(unknown.status, 401);
    const unknownBody = (await readJson(unknown)) as { error?: unknown };
    assert.equal(unknownBody.error, wrongBody.error);

    const success = await login(`  ${address.toUpperCase()}  `, password);
    assert.equal(success.status, 200);
    const successBody = await readJson(success);
    assert.equal(JSON.stringify(successBody).includes(password), false);
    assert.equal(JSON.stringify(successBody).includes(passwordHash), false);
    const session = authCookie(success);
    assert.equal((await currentUser(session.cookie)).status, 200);

    const now = Math.floor(Date.now() / 1000);
    const expired = signedToken(user.id, now - 120, now - 60);
    assert.equal(verifyAuthToken(expired), null);
    assert.equal(
      (await currentUser(`auth_token=${expired}`)).status,
      401,
    );

    const tampered = `${session.token.slice(0, -1)}${session.token.endsWith("a") ? "b" : "a"}`;
    assert.equal(verifyAuthToken(tampered), null);
    assert.equal(
      (await currentUser(`auth_token=${tampered}`)).status,
      401,
    );
    assert.equal((await currentUser("auth_token=not-a-jwt")).status, 401);

    const loggedOut = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: session.cookie },
    });
    assert.equal(loggedOut.status, 200);
    assert.deepEqual(await readJson(loggedOut), { success: true });
    const cleared = loggedOut.headers
      .getSetCookie()
      .find((value) => value.toLowerCase().startsWith("auth_token="));
    assert.ok(cleared);
    assert.match(cleared.toLowerCase(), /max-age=0|expires=/);
    assert.equal((await currentUser(session.cookie)).status, 200);

    const again = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
    assert.equal(again.status, 200);
    assert.equal((await currentUser()).status, 401);
  });

  it("rejects protected API and Google routes without a session", async () => {
    const routes: Array<{ method: string; path: string; body?: string }> = [
      { method: "GET", path: "/api/apis" },
      { method: "POST", path: "/api/apis", body: "{}" },
      { method: "PATCH", path: "/api/apis/1", body: JSON.stringify({ name: "Nope" }) },
      { method: "DELETE", path: "/api/apis/1" },
      { method: "GET", path: "/api/apis/1/keys" },
      {
        method: "POST",
        path: "/api/apis/1/keys",
        body: JSON.stringify({ name: "Nope" }),
      },
      { method: "POST", path: "/api/apis/1/keys/1/revoke" },
      { method: "GET", path: "/api/google/sheets" },
      { method: "GET", path: "/api/google/picker" },
      { method: "GET", path: "/api/google/sheets/selection" },
      {
        method: "POST",
        path: "/api/google/sheets/selection",
        body: JSON.stringify({ spreadsheetId: "sheet" }),
      },
      { method: "DELETE", path: "/api/google/sheets/selection/sheet-id" },
      { method: "DELETE", path: "/api/auth/google" },
      { method: "GET", path: "/api/google/sheets/sheet-id" },
      { method: "GET", path: "/api/google/sheets/sheet-id/preview?sheetId=0" },
    ];

    for (const route of routes) {
      const response = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers: route.body ? { "content-type": "application/json" } : undefined,
        body: route.body,
        cache: "no-store",
      });
      assert.equal(response.status, 401, `${route.method} ${route.path}`);
      const body = await readJson(response);
      assert.equal(JSON.stringify(body).toLowerCase().includes("token"), false);
    }
  });

  it("stores only reset token hashes and rejects old sessions after reset", async () => {
    const address = email("reset");
    const passwordHash = await bcrypt.hash(password, 4);
    const user = await prisma.user.create({
      data: {
        name: "Reset User",
        email: address,
        password: passwordHash,
      },
    });
    const loggedIn = await login(address, password);
    assert.equal(loggedIn.status, 200);
    const session = authCookie(loggedIn);

    const unknown = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email("unknown") }),
    });
    assert.equal(unknown.status, 200);
    assert.deepEqual(await readJson(unknown), {
      message: PASSWORD_RESET_REQUEST_MESSAGE,
    });
    assert.equal(
      await prisma.passwordResetToken.count({ where: { userId: user.id } }),
      0,
    );

    const expired = await issuePasswordResetToken(user.id);
    await prisma.passwordResetToken.update({
      where: { tokenHash: hashResetToken(expired) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiredResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: expired, password: nextPassword }),
    });
    assert.equal(expiredResponse.status, 400);
    assert.equal(
      (
        await prisma.user.findUnique({
          where: { id: user.id },
          select: { passwordChangedAt: true },
        })
      )?.passwordChangedAt,
      null,
    );

    const replaced = await issuePasswordResetToken(user.id);
    const current = await issuePasswordResetToken(user.id);
    const replacedRow = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(replaced) },
    });
    assert.notEqual(replacedRow?.usedAt, null);
    assert.equal(
      JSON.stringify(replacedRow).includes(replaced),
      false,
    );
    const short = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: current, password: "short" }),
    });
    assert.equal(short.status, 400);
    assert.equal(
      (
        await prisma.passwordResetToken.findUnique({
          where: { tokenHash: hashResetToken(current) },
        })
      )?.usedAt,
      null,
    );

    const reset = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: current, password: nextPassword }),
    });
    assert.equal(reset.status, 200);
    const resetBody = await readJson(reset);
    assert.equal(JSON.stringify(resetBody).includes(current), false);
    assert.equal(JSON.stringify(resetBody).includes(nextPassword), false);
    const used = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(current) },
    });
    assert.notEqual(used?.usedAt, null);
    assert.equal(JSON.stringify(used).includes(current), false);
    const changed = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true, passwordChangedAt: true },
    });
    assert.ok(changed?.passwordChangedAt);
    assert.notEqual(changed?.password, passwordHash);
    assert.equal(JSON.stringify(changed).includes(nextPassword), false);

    const issuedAt = verifyAuthToken(session.token)?.issuedAt ?? 0;
    const changedSeconds = Math.floor(
      (changed?.passwordChangedAt?.getTime() ?? 0) / 1000,
    );

    if (issuedAt >= changedSeconds) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordChangedAt: new Date((issuedAt + 1) * 1000) },
      });
    }

    assert.equal((await currentUser(session.cookie)).status, 401);
    const oldLogin = await login(address, password);
    assert.equal(oldLogin.status, 401);
    const newLogin = await login(address, nextPassword);
    assert.equal(newLogin.status, 200);
    assert.equal((await currentUser(authCookie(newLogin).cookie)).status, 200);

    const reused = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: current, password: `${nextPassword}2` }),
    });
    assert.equal(reused.status, 400);
    const replacedAttempt = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: replaced, password: `${nextPassword}3` }),
    });
    assert.equal(replacedAttempt.status, 400);
    assert.equal((await login(address, nextPassword)).status, 200);
  });

  it("writes a development reset message without storing the raw token", async (t) => {
    if (process.env.SMTP_HOST?.trim()) {
      t.skip("blocked: SMTP is configured, so this would send mail");
      return;
    }

    const address = email("mail");
    await prisma.user.create({
      data: {
        name: "Mail User",
        email: address,
        password: await bcrypt.hash(password, 4),
      },
    });
    const before = new Set(await readdir(devMailDir).catch(() => []));
    const known = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: address }),
    });
    const unknown = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email("mail-unknown") }),
    });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.deepEqual(await readJson(known), await readJson(unknown));

    const stored = await prisma.passwordResetToken.findFirst({
      where: { user: { email: address } },
    });
    assert.ok(stored);
    const created = (await readdir(devMailDir)).filter((name) => !before.has(name));
    assert.equal(created.length, 1);
    const contents = await readFile(path.join(devMailDir, created[0] ?? ""), "utf8");
    const token = contents.match(/token=([^&\s]+)/)?.[1];
    assert.equal(typeof token, "string");
    assert.equal(token ? hashResetToken(token) === stored.tokenHash : false, true);
    assert.equal(contents.includes(stored.tokenHash), false);
    await unlink(path.join(devMailDir, created[0] ?? ""));
  });
});

after(async () => {
  await prisma.user.deleteMany({
    where: { email: { in: [...createdEmails] } },
  });
  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});
