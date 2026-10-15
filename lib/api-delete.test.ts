import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, describe, it } from "node:test";
import bcrypt from "bcrypt";
import { GET } from "../app/api/v1/[slug]/route";
import { createAuthToken } from "./auth";
import { hashApiKey } from "./api-key";
import { authenticateApiKey, createOwnedApiKey } from "./api-key-store";
import { withGoogleAccessToken } from "./google-access";
import { readWorksheetRecords } from "./google-worksheets";
import { prisma } from "./prisma";

const stamp = Date.now();
const password = `delete-api-${stamp}-pass`;
const ownerEmail = `delete-api-${stamp}-owner@example.com`;
const otherEmail = `delete-api-${stamp}-other@example.com`;
const baseUrl = "http://127.0.0.1:3000";

async function callPublic(slug: string, authorization?: string) {
  const headers = new Headers();

  if (authorization) {
    headers.set("authorization", authorization);
  }

  const response = await GET(
    new Request(`http://localhost/api/v1/${slug}`, { headers }),
    { params: Promise.resolve({ slug }) },
  );
  const body: unknown = await response.json();

  return { status: response.status, body };
}

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

async function deleteApi(cookie: string | null, apiId: string) {
  const headers = new Headers();

  if (cookie) {
    headers.set("cookie", cookie);
  }

  const response = await fetch(`${baseUrl}/api/apis/${apiId}`, {
    method: "DELETE",
    headers,
    cache: "no-store",
  });
  const body: unknown = await response.json();

  return { status: response.status, body };
}

function errorCode(body: unknown) {
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  const record = body as {
    success?: unknown;
    error?: { code?: unknown };
  };
  assert.equal(record.success, false);
  return record.error?.code;
}

describe("delete API", () => {
  it("removes only the signed-in user's API and its keys", async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const owner = await prisma.user.create({
      data: {
        name: "Delete API owner",
        email: ownerEmail,
        password: passwordHash,
      },
    });
    const other = await prisma.user.create({
      data: {
        name: "Delete API other",
        email: otherEmail,
        password: passwordHash,
      },
    });
    const spreadsheet = await prisma.selectedSpreadsheet.create({
      data: {
        userId: owner.id,
        spreadsheetId: `sheet-delete-${stamp}`,
        name: "Keep this spreadsheet",
      },
    });
    const doomed = await prisma.api.create({
      data: {
        userId: owner.id,
        name: "Delete me",
        slug: `del${stamp}a`,
        spreadsheetId: spreadsheet.spreadsheetId,
        worksheetId: 0,
        worksheetName: "Sheet1",
      },
    });
    const kept = await prisma.api.create({
      data: {
        userId: owner.id,
        name: "Keep me",
        slug: `del${stamp}b`,
        spreadsheetId: spreadsheet.spreadsheetId,
        worksheetId: 1,
        worksheetName: "Sheet2",
      },
    });
    const foreignSpreadsheetId = `sheet-other-${stamp}`;
    await prisma.selectedSpreadsheet.create({
      data: {
        userId: other.id,
        spreadsheetId: foreignSpreadsheetId,
        name: "Other spreadsheet",
      },
    });
    const foreign = await prisma.api.create({
      data: {
        userId: other.id,
        name: "Other user API",
        slug: `del${stamp}c`,
        spreadsheetId: foreignSpreadsheetId,
        worksheetId: 0,
        worksheetName: "Other",
      },
    });

    try {
      const doomedKey = await createOwnedApiKey(owner.id, doomed.id, "Doomed");
      const keptKey = await createOwnedApiKey(owner.id, kept.id, "Kept");
      const foreignKey = await createOwnedApiKey(other.id, foreign.id, "Foreign");
      assert.equal(doomedKey.ok, true);
      assert.equal(keptKey.ok, true);
      assert.equal(foreignKey.ok, true);

      if (!doomedKey.ok || !keptKey.ok || !foreignKey.ok) {
        return;
      }

      const ownerCookie = await login(ownerEmail);
      const otherCookie = await login(otherEmail);

      const unauthenticated = await deleteApi(null, String(doomed.id));
      assert.equal(unauthenticated.status, 401);
      assert.equal(errorCode(unauthenticated.body), "UNAUTHORIZED");
      assert.ok(
        await prisma.api.findUnique({ where: { id: doomed.id }, select: { id: true } }),
      );

      const forbidden = await deleteApi(otherCookie, String(doomed.id));
      assert.equal(forbidden.status, 404);
      assert.equal(errorCode(forbidden.body), "NOT_FOUND");
      assert.ok(
        await prisma.api.findUnique({ where: { id: doomed.id }, select: { id: true } }),
      );

      for (const apiId of ["nope", "0", "1.5", "9999999999"]) {
        const invalid = await deleteApi(ownerCookie, apiId);
        assert.equal(invalid.status, 404);
        assert.equal(errorCode(invalid.body), "NOT_FOUND");
      }

      const missing = await deleteApi(ownerCookie, "2147483646");
      assert.equal(missing.status, 404);
      assert.equal(errorCode(missing.body), "NOT_FOUND");

      const [first, second] = await Promise.all([
        deleteApi(ownerCookie, String(doomed.id)),
        deleteApi(ownerCookie, String(doomed.id)),
      ]);
      const statuses = [first.status, second.status].sort();
      assert.deepEqual(statuses, [200, 404]);
      const success = [first, second].find((result) => result.status === 200);
      assert.deepEqual(success?.body, { success: true });
      assert.equal(JSON.stringify(success?.body).includes(doomedKey.secret), false);

      assert.equal(
        await prisma.api.findUnique({ where: { id: doomed.id }, select: { id: true } }),
        null,
      );
      assert.equal(
        await prisma.apiKey.findUnique({
          where: { keyHash: hashApiKey(doomedKey.secret) },
        }),
        null,
      );
      const saved = await prisma.selectedSpreadsheet.findUnique({
        where: { id: spreadsheet.id },
      });
      assert.equal(saved?.name, "Keep this spreadsheet");
      assert.equal(saved?.spreadsheetId, spreadsheet.spreadsheetId);
      assert.ok(await prisma.api.findUnique({ where: { id: kept.id } }));
      assert.ok(await prisma.api.findUnique({ where: { id: foreign.id } }));
      assert.ok(
        await prisma.apiKey.findUnique({
          where: { keyHash: hashApiKey(keptKey.secret) },
        }),
      );

      const deletedRead = await callPublic(doomed.slug, `Bearer ${doomedKey.secret}`);
      assert.equal(deletedRead.status, 404);
      assert.equal(errorCode(deletedRead.body), "NOT_FOUND");
      assert.equal(Array.isArray(deletedRead.body), false);
      const rejected = await authenticateApiKey(
        kept.id,
        `Bearer ${doomedKey.secret}`,
      );
      assert.equal(rejected.ok, false);

      const keptRead = await callPublic(kept.slug, `Bearer ${keptKey.secret}`);
      assert.equal(keptRead.status, 503);
      assert.equal(errorCode(keptRead.body), "GOOGLE_NOT_CONNECTED");
      const keptRow = await prisma.apiKey.findUnique({
        where: { id: keptKey.key.id },
        select: { lastUsedAt: true },
      });
      assert.ok(keptRow?.lastUsedAt);

      const foreignRead = await callPublic(
        foreign.slug,
        `Bearer ${foreignKey.secret}`,
      );
      assert.equal(foreignRead.status, 503);
      assert.equal(errorCode(foreignRead.body), "GOOGLE_NOT_CONNECTED");
      const foreignRow = await prisma.apiKey.findUnique({
        where: { id: foreignKey.key.id },
        select: { lastUsedAt: true },
      });
      assert.ok(foreignRow?.lastUsedAt);

      const stillForbidden = await deleteApi(otherCookie, String(kept.id));
      assert.equal(stillForbidden.status, 404);
      assert.ok(await prisma.api.findUnique({ where: { id: kept.id } }));
    } finally {
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, otherEmail] } },
      });
    }
  });

  it("leaves the linked Google spreadsheet and other APIs in place", async (t) => {
    const connection = await prisma.googleConnection.findFirst({
      select: { userId: true },
    });

    if (!connection) {
      t.skip("blocked: no connected Google account");
      return;
    }

    const candidates = await prisma.api.findMany({
      where: { userId: connection.userId, status: "ACTIVE" },
      orderBy: { id: "asc" },
    });
    let existing: (typeof candidates)[number] | null = null;
    let savedBefore: {
      id: number;
      spreadsheetId: string;
      name: string;
    } | null = null;

    for (const candidate of candidates) {
      const saved = await prisma.selectedSpreadsheet.findUnique({
        where: {
          userId_spreadsheetId: {
            userId: connection.userId,
            spreadsheetId: candidate.spreadsheetId,
          },
        },
        select: { id: true, spreadsheetId: true, name: true },
      });

      if (saved) {
        existing = candidate;
        savedBefore = saved;
        break;
      }
    }

    if (!existing || !savedBefore) {
      t.skip(
        "blocked: connected account has no active API with a saved spreadsheet",
      );
      return;
    }

    const otherApis = await prisma.api.findMany({
      where: {
        userId: connection.userId,
        id: { not: existing.id },
      },
      select: { id: true, slug: true },
    });

    const before = await withGoogleAccessToken(connection.userId, (accessToken) =>
      readWorksheetRecords(
        accessToken,
        existing.spreadsheetId,
        existing.worksheetId,
      ),
    );
    const beforeHash = createHash("sha256")
      .update(JSON.stringify(before.rows))
      .digest("hex");

    const temporary = await prisma.api.create({
      data: {
        userId: connection.userId,
        name: "Temporary delete check",
        slug: `del${stamp}g`,
        spreadsheetId: existing.spreadsheetId,
        worksheetId: existing.worksheetId,
        worksheetName: existing.worksheetName,
      },
    });
    let keptKeyId: number | null = null;

    try {
      const temporaryKey = await createOwnedApiKey(
        connection.userId,
        temporary.id,
        "Temporary",
      );
      const keptKey = await createOwnedApiKey(
        connection.userId,
        existing.id,
        "Delete check",
      );
      assert.equal(temporaryKey.ok, true);
      assert.equal(keptKey.ok, true);

      if (!temporaryKey.ok || !keptKey.ok) {
        return;
      }

      keptKeyId = keptKey.key.id;

      const served = await fetch(`${baseUrl}/api/v1/${temporary.slug}`, {
        headers: { authorization: `Bearer ${temporaryKey.secret}` },
        cache: "no-store",
      });
      const servedBody: unknown = await served.json();
      assert.equal(served.status, 200);
      assert.equal(Array.isArray(servedBody), true);

      const cookie = `auth_token=${createAuthToken(connection.userId)}`;
      const deleted = await deleteApi(cookie, String(temporary.id));
      assert.equal(deleted.status, 200);
      assert.deepEqual(deleted.body, { success: true });

      const after = await withGoogleAccessToken(connection.userId, (accessToken) =>
        readWorksheetRecords(
          accessToken,
          existing.spreadsheetId,
          existing.worksheetId,
        ),
      );
      const afterHash = createHash("sha256")
        .update(JSON.stringify(after.rows))
        .digest("hex");
      assert.equal(afterHash, beforeHash);
      assert.equal(after.rows.length, before.rows.length);

      const savedAfter = await prisma.selectedSpreadsheet.findUnique({
        where: { id: savedBefore.id },
      });
      assert.equal(savedAfter?.spreadsheetId, savedBefore.spreadsheetId);
      assert.equal(savedAfter?.name, savedBefore.name);
      assert.equal(
        await prisma.api.findUnique({ where: { id: temporary.id }, select: { id: true } }),
        null,
      );
      assert.equal(
        await prisma.apiKey.findUnique({
          where: { keyHash: hashApiKey(temporaryKey.secret) },
        }),
        null,
      );

      const gone = await fetch(`${baseUrl}/api/v1/${temporary.slug}`, {
        headers: { authorization: `Bearer ${temporaryKey.secret}` },
        cache: "no-store",
      });
      const goneBody: unknown = await gone.json();
      assert.equal(gone.status, 404);
      assert.equal(errorCode(goneBody), "NOT_FOUND");
      assert.equal(Array.isArray(goneBody), false);

      const stillThere = await fetch(`${baseUrl}/api/v1/${existing.slug}`, {
        headers: { authorization: `Bearer ${keptKey.secret}` },
        cache: "no-store",
      });
      const stillBody: unknown = await stillThere.json();
      assert.equal(stillThere.status, 200);
      assert.equal(Array.isArray(stillBody), true);
      assert.equal(
        createHash("sha256").update(JSON.stringify(stillBody)).digest("hex"),
        beforeHash,
      );

      for (const api of otherApis) {
        assert.ok(await prisma.api.findUnique({ where: { id: api.id } }));
      }
    } finally {
      if (keptKeyId != null) {
        await prisma.apiKey.deleteMany({ where: { id: keptKeyId } });
      }

      await prisma.api.deleteMany({ where: { id: temporary.id } });
    }
  });
});

after(async () => {
  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});
