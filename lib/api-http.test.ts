import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, describe, it } from "node:test";
import bcrypt from "bcrypt";
import { hashApiKey } from "./api-key";
import { prisma } from "./prisma";

const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Http-${stamp}-pass`;
const ownerEmail = `api-http-${stamp}-owner@example.com`;
const otherEmail = `api-http-${stamp}-other@example.com`;
const baseUrl = "http://127.0.0.1:3000";

async function login(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .find((value) => value?.startsWith("auth_token="));
  assert.ok(cookie);
  return cookie;
}

async function send(
  cookie: string | null,
  method: string,
  path: string,
  body?: string,
) {
  const headers = new Headers();

  if (cookie) {
    headers.set("cookie", cookie);
  }

  if (body != null) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body,
    cache: "no-store",
  });
  const parsed: unknown = await response.json();

  return { status: response.status, body: parsed };
}

function errorCode(body: unknown) {
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  const record = body as { success?: unknown; error?: { code?: unknown } };
  assert.equal(record.success, false);
  return record.error?.code;
}

describe("API configuration and key HTTP routes", { concurrency: 1 }, () => {
  it("lists, creates, and rejects unowned or invalid API configurations", async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const owner = await prisma.user.create({
      data: { name: "HTTP owner", email: ownerEmail, password: passwordHash },
    });
    const other = await prisma.user.create({
      data: { name: "HTTP other", email: otherEmail, password: passwordHash },
    });
    const ownerSheet = `sheet-http-owner-${stamp}`;
    const otherSheet = `sheet-http-other-${stamp}`;
    await prisma.selectedSpreadsheet.create({
      data: { userId: owner.id, spreadsheetId: ownerSheet, name: "Owner sheet" },
    });
    await prisma.selectedSpreadsheet.create({
      data: { userId: other.id, spreadsheetId: otherSheet, name: "Other sheet" },
    });
    const existing = await prisma.api.create({
      data: {
        userId: owner.id,
        name: "Existing",
        slug: `http${stamp.replace(/[^a-z0-9]/g, "")}a`,
        spreadsheetId: ownerSheet,
        worksheetId: 0,
        worksheetName: "Sheet1",
      },
    });
    const foreign = await prisma.api.create({
      data: {
        userId: other.id,
        name: "Foreign",
        slug: `http${stamp.replace(/[^a-z0-9]/g, "")}b`,
        spreadsheetId: otherSheet,
        worksheetId: 0,
        worksheetName: "Other",
      },
    });

    try {
      const ownerCookie = await login(ownerEmail);
      const otherCookie = await login(otherEmail);
      const signedOut = await send(null, "GET", "/api/apis");
      assert.equal(signedOut.status, 401);
      assert.equal(errorCode(signedOut.body), "UNAUTHORIZED");

      const listed = await send(ownerCookie, "GET", "/api/apis");
      assert.equal(listed.status, 200);
      const listedText = JSON.stringify(listed.body);
      assert.equal(listedText.includes(existing.slug), true);
      assert.equal(listedText.includes(foreign.slug), false);
      assert.equal(listedText.includes(ownerSheet), false);
      assert.equal(listedText.toLowerCase().includes("token"), false);
      assert.equal(listedText.includes("keyHash"), false);

      const otherList = await send(otherCookie, "GET", "/api/apis");
      const otherText = JSON.stringify(otherList.body);
      assert.equal(otherText.includes(foreign.slug), true);
      assert.equal(otherText.includes(existing.slug), false);

      const invalid = await send(
        ownerCookie,
        "POST",
        "/api/apis",
        JSON.stringify({ name: "   " }),
      );
      assert.equal(invalid.status, 400);
      assert.equal(errorCode(invalid.body), "INVALID_INPUT");

      const unsaved = await send(
        ownerCookie,
        "POST",
        "/api/apis",
        JSON.stringify({
          name: "Missing sheet",
          slug: `http${stamp.replace(/[^a-z0-9]/g, "")}c`,
          spreadsheetId: `missing-${stamp}`,
          worksheetId: 0,
        }),
      );
      assert.equal(unsaved.status, 404);
      assert.equal(errorCode(unsaved.body), "SPREADSHEET_NOT_FOUND");

      const stolenSheet = await send(
        ownerCookie,
        "POST",
        "/api/apis",
        JSON.stringify({
          name: "Stolen sheet",
          slug: `http${stamp.replace(/[^a-z0-9]/g, "")}d`,
          spreadsheetId: otherSheet,
          worksheetId: 0,
        }),
      );
      assert.equal(stolenSheet.status, 404);
      assert.equal(errorCode(stolenSheet.body), "SPREADSHEET_NOT_FOUND");

      const duplicate = await send(
        ownerCookie,
        "POST",
        "/api/apis",
        JSON.stringify({
          name: "Duplicate",
          slug: existing.slug,
          spreadsheetId: ownerSheet,
          worksheetId: 0,
        }),
      );
      assert.equal(duplicate.status, 409);
      assert.equal(errorCode(duplicate.body), "SLUG_TAKEN");

      const withoutGoogle = await send(
        ownerCookie,
        "POST",
        "/api/apis",
        JSON.stringify({
          name: "Needs Google",
          slug: `http${stamp.replace(/[^a-z0-9]/g, "")}e`,
          spreadsheetId: ownerSheet,
          worksheetId: 0,
        }),
      );
      assert.equal(withoutGoogle.status, 404);
      assert.equal(errorCode(withoutGoogle.body), "GOOGLE_NOT_CONNECTED");
      assert.equal(
        await prisma.api.findUnique({
          where: { slug: `http${stamp.replace(/[^a-z0-9]/g, "")}e` },
        }),
        null,
      );
      assert.equal(await prisma.api.count({ where: { userId: owner.id } }), 1);
      assert.equal(await prisma.api.count({ where: { userId: other.id } }), 1);
      assert.ok(
        await prisma.selectedSpreadsheet.findFirst({
          where: { userId: owner.id, spreadsheetId: ownerSheet },
        }),
      );
    } finally {
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, otherEmail] } },
      });
    }
  });

  it("keeps API keys on the owning API and rejects revoked or query keys", async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const owner = await prisma.user.create({
      data: { name: "Key owner", email: ownerEmail, password: passwordHash },
    });
    await prisma.user.create({
      data: { name: "Key other", email: otherEmail, password: passwordHash },
    });
    const spreadsheetId = `sheet-http-keys-${stamp}`;
    await prisma.selectedSpreadsheet.create({
      data: { userId: owner.id, spreadsheetId, name: "Keys" },
    });
    const api = await prisma.api.create({
      data: {
        userId: owner.id,
        name: "Keyed",
        slug: `key${stamp.replace(/[^a-z0-9]/g, "")}a`,
        spreadsheetId,
        worksheetId: 0,
        worksheetName: "Sheet1",
      },
    });
    const second = await prisma.api.create({
      data: {
        userId: owner.id,
        name: "Second",
        slug: `key${stamp.replace(/[^a-z0-9]/g, "")}b`,
        spreadsheetId,
        worksheetId: 1,
        worksheetName: "Sheet2",
      },
    });

    try {
      const ownerCookie = await login(ownerEmail);
      const otherCookie = await login(otherEmail);
      const supplied = "client-supplied-secret-must-not-be-accepted";
      const created = await send(
        ownerCookie,
        "POST",
        `/api/apis/${api.id}/keys`,
        JSON.stringify({ name: "  Website  ", secret: supplied, key: supplied }),
      );
      assert.equal(created.status, 201);
      const createdKey = (
        created.body as {
          key?: { id?: unknown; secret?: unknown; keyPrefix?: unknown; name?: unknown };
        }
      ).key;
      assert.equal(createdKey?.name, "Website");
      assert.equal(typeof createdKey?.secret, "string");
      const secret = String(createdKey?.secret);
      assert.match(secret, /^sk_live_[A-Za-z0-9_-]{43}$/);
      assert.notEqual(secret, supplied);
      assert.equal(secret.startsWith(String(createdKey?.keyPrefix)), true);
      assert.notEqual(createdKey?.keyPrefix, secret);
      const stored = await prisma.apiKey.findFirst({
        where: { apiId: api.id, name: "Website" },
      });
      assert.equal(stored?.keyHash, hashApiKey(secret));
      assert.equal(JSON.stringify(stored).includes(secret), false);

      const listed = await send(ownerCookie, "GET", `/api/apis/${api.id}/keys`);
      const listedText = JSON.stringify(listed.body);
      assert.equal(listed.status, 200);
      assert.equal(listedText.includes(secret), false);
      assert.equal(listedText.includes(stored?.keyHash ?? "missing-hash"), false);

      const foreignList = await send(otherCookie, "GET", `/api/apis/${api.id}/keys`);
      assert.equal(foreignList.status, 404);
      const foreignCreate = await send(
        otherCookie,
        "POST",
        `/api/apis/${api.id}/keys`,
        JSON.stringify({ name: "Stolen" }),
      );
      assert.equal(foreignCreate.status, 404);
      assert.equal(await prisma.apiKey.count({ where: { apiId: api.id } }), 1);

      const invalidName = await send(
        ownerCookie,
        "POST",
        `/api/apis/${api.id}/keys`,
        JSON.stringify({ name: "bad\nname" }),
      );
      assert.equal(invalidName.status, 400);

      const secondKey = await send(
        ownerCookie,
        "POST",
        `/api/apis/${second.id}/keys`,
        JSON.stringify({ name: "Other API" }),
      );
      assert.equal(secondKey.status, 201);
      const secondSecret = String(
        (secondKey.body as { key?: { secret?: unknown } }).key?.secret,
      );

      const publicHeaders = (authorization?: string, query = "") => {
        const headers = new Headers();

        if (authorization) {
          headers.set("authorization", authorization);
        }

        return fetch(`${baseUrl}/api/v1/${api.slug}${query}`, {
          headers,
          cache: "no-store",
        });
      };

      const missing = await publicHeaders();
      assert.equal(missing.status, 401);
      const fromQuery = await publicHeaders(
        undefined,
        `?api_key=${encodeURIComponent(secret)}`,
      );
      assert.equal(fromQuery.status, 401);
      const wrongApi = await publicHeaders(`Bearer ${secondSecret}`);
      assert.equal(wrongApi.status, 401);
      const beforeUse = await prisma.apiKey.findUnique({
        where: { keyHash: hashApiKey(secret) },
        select: { lastUsedAt: true },
      });
      assert.equal(beforeUse?.lastUsedAt, null);

      const renamed = await send(
        ownerCookie,
        "PATCH",
        `/api/apis/${api.id}`,
        JSON.stringify({
          name: "Renamed keyed",
          slug: "changed-slug",
          spreadsheetId: "other-sheet",
          worksheetId: 9,
        }),
      );
      assert.equal(renamed.status, 200);
      const renamedApi = (renamed.body as { api?: { name?: unknown; slug?: unknown; status?: unknown } })
        .api;
      assert.equal(renamedApi?.name, "Renamed keyed");
      assert.equal(renamedApi?.slug, api.slug);
      const afterRename = await prisma.api.findUnique({ where: { id: api.id } });
      assert.equal(afterRename?.spreadsheetId, spreadsheetId);
      assert.equal(afterRename?.worksheetId, 0);
      assert.equal(afterRename?.worksheetName, "Sheet1");
      assert.equal(
        (await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(secret) } }))
          ?.keyHash,
        hashApiKey(secret),
      );

      const disabled = await send(
        ownerCookie,
        "PATCH",
        `/api/apis/${api.id}`,
        JSON.stringify({ status: "DISABLED" }),
      );
      assert.equal(disabled.status, 200);
      const blocked = await publicHeaders(`Bearer ${secret}`);
      const blockedBody: unknown = await blocked.json();
      assert.equal(blocked.status, 403);
      assert.equal(errorCode(blockedBody), "API_DISABLED");
      assert.equal(Array.isArray(blockedBody), false);
      assert.equal(
        (
          await prisma.apiKey.findUnique({
            where: { keyHash: hashApiKey(secret) },
            select: { lastUsedAt: true },
          })
        )?.lastUsedAt,
        null,
      );

      const enabled = await send(
        ownerCookie,
        "PATCH",
        `/api/apis/${api.id}`,
        JSON.stringify({ status: "ACTIVE" }),
      );
      assert.equal(enabled.status, 200);
      const restored = await publicHeaders(`Bearer ${secret}`);
      const restoredBody: unknown = await restored.json();
      assert.equal(restored.status, 503);
      assert.equal(errorCode(restoredBody), "GOOGLE_NOT_CONNECTED");

      const keyId = Number(createdKey?.id);
      const revoked = await send(
        ownerCookie,
        "POST",
        `/api/apis/${api.id}/keys/${keyId}/revoke`,
      );
      assert.equal(revoked.status, 200);
      const revokedAgain = await send(
        ownerCookie,
        "POST",
        `/api/apis/${api.id}/keys/${keyId}/revoke`,
      );
      assert.equal(revokedAgain.status, 200);
      const firstRevokedAt = (revoked.body as { key?: { revokedAt?: unknown } }).key
        ?.revokedAt;
      const secondRevokedAt = (revokedAgain.body as { key?: { revokedAt?: unknown } })
        .key?.revokedAt;
      assert.equal(firstRevokedAt, secondRevokedAt);
      assert.equal(JSON.stringify(revoked.body).includes(secret), false);
      const revokedCall = await publicHeaders(`Bearer ${secret}`);
      assert.equal(revokedCall.status, 401);

      const foreignRevoke = await send(
        otherCookie,
        "POST",
        `/api/apis/${second.id}/keys/${
          (secondKey.body as { key?: { id?: unknown } }).key?.id
        }/revoke`,
      );
      assert.equal(foreignRevoke.status, 404);
      const secondStill = await prisma.apiKey.findUnique({
        where: { keyHash: hashApiKey(secondSecret) },
      });
      assert.equal(secondStill?.revokedAt, null);

      const removed = await send(ownerCookie, "DELETE", `/api/apis/${api.id}`);
      assert.equal(removed.status, 200);
      assert.equal(
        await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(secret) } }),
        null,
      );
      assert.ok(await prisma.api.findUnique({ where: { id: second.id } }));
      assert.ok(
        await prisma.selectedSpreadsheet.findFirst({
          where: { userId: owner.id, spreadsheetId },
        }),
      );
      const gone = await publicHeaders(`Bearer ${secret}`);
      assert.equal(gone.status, 404);
      const secondRead = await fetch(`${baseUrl}/api/v1/${second.slug}`, {
        headers: { authorization: `Bearer ${secondSecret}` },
        cache: "no-store",
      });
      assert.equal(secondRead.status, 503);
    } finally {
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, otherEmail] } },
      });
    }
  });
});

after(async () => {
  await prisma.user.deleteMany({
    where: { email: { in: [ownerEmail, otherEmail] } },
  });
  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});
