import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, describe, it } from "node:test";
import bcrypt from "bcrypt";
import { createAuthToken } from "./auth";
import { hashApiKey } from "./api-key";
import { createOwnedApiKey } from "./api-key-store";
import { withGoogleAccessToken } from "./google-access";
import {
  readSpreadsheetWorksheets,
  readWorksheetRecords,
} from "./google-worksheets";
import { withConnectedAccountLock } from "./connected-account-test-lock";
import { prisma } from "./prisma";

const stamp = Date.now();
const password = `manage-api-${stamp}-pass`;
const ownerEmail = `manage-api-${stamp}-owner@example.com`;
const otherEmail = `manage-api-${stamp}-other@example.com`;
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

async function patchApi(cookie: string | null, apiId: string, body: string) {
  const headers = new Headers({ "content-type": "application/json" });

  if (cookie) {
    headers.set("cookie", cookie);
  }

  const response = await fetch(`${baseUrl}/api/apis/${apiId}`, {
    method: "PATCH",
    headers,
    body,
    cache: "no-store",
  });
  const parsed: unknown = await response.json();

  return { status: response.status, body: parsed };
}

async function callPublic(slug: string, authorization?: string) {
  const headers = new Headers();

  if (authorization) {
    headers.set("authorization", authorization);
  }

  const response = await fetch(`${baseUrl}/api/v1/${slug}`, {
    headers,
    cache: "no-store",
  });
  const body: unknown = await response.json();

  return { status: response.status, body };
}

async function revokeKey(cookie: string, apiId: number, keyId: number) {
  const response = await fetch(`${baseUrl}/api/apis/${apiId}/keys/${keyId}/revoke`, {
    method: "POST",
    headers: { cookie },
    cache: "no-store",
  });
  const body: unknown = await response.json();

  return { status: response.status, body };
}

async function deleteApi(cookie: string, apiId: number) {
  const response = await fetch(`${baseUrl}/api/apis/${apiId}`, {
    method: "DELETE",
    headers: { cookie },
    cache: "no-store",
  });
  const body: unknown = await response.json();

  return { status: response.status, body };
}

function errorCode(body: unknown) {
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  assert.equal(Array.isArray(body), false);
  const record = body as {
    success?: unknown;
    error?: { code?: unknown; message?: unknown };
  };
  assert.equal(record.success, false);
  return record.error?.code;
}

function managedApi(body: unknown) {
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  const record = body as {
    success?: unknown;
    api?: {
      name?: unknown;
      slug?: unknown;
      spreadsheetId?: unknown;
      worksheetId?: unknown;
      worksheetName?: unknown;
      status?: unknown;
    };
  };
  assert.equal(record.success, true);
  assert.ok(record.api);
  return record.api;
}

describe("API rename and enable/disable", () => {
  it("updates only the owner's display name and status", async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const owner = await prisma.user.create({
      data: {
        name: "Manage API owner",
        email: ownerEmail,
        password: passwordHash,
      },
    });
    await prisma.user.create({
      data: {
        name: "Manage API other",
        email: otherEmail,
        password: passwordHash,
      },
    });
    const spreadsheet = await prisma.selectedSpreadsheet.create({
      data: {
        userId: owner.id,
        spreadsheetId: `sheet-manage-${stamp}`,
        name: "Keep this spreadsheet",
      },
    });
    const api = await prisma.api.create({
      data: {
        userId: owner.id,
        name: "Original name",
        slug: `mng${stamp}a`,
        spreadsheetId: spreadsheet.spreadsheetId,
        worksheetId: 4,
        worksheetName: "Sheet1",
      },
    });
    const kept = await prisma.api.create({
      data: {
        userId: owner.id,
        name: "Keep me",
        slug: `mng${stamp}b`,
        spreadsheetId: spreadsheet.spreadsheetId,
        worksheetId: 5,
        worksheetName: "Sheet2",
      },
    });

    try {
      const created = await createOwnedApiKey(owner.id, api.id, "Website");
      const keptKey = await createOwnedApiKey(owner.id, kept.id, "Kept");
      assert.equal(created.ok, true);
      assert.equal(keptKey.ok, true);

      if (!created.ok || !keptKey.ok) {
        return;
      }

      const beforeKey = await prisma.apiKey.findUnique({
        where: { id: created.key.id },
      });
      assert.ok(beforeKey);
      const ownerCookie = await login(ownerEmail);
      const otherCookie = await login(otherEmail);

      const signedOut = await patchApi(
        null,
        String(api.id),
        JSON.stringify({ name: "Stolen" }),
      );
      assert.equal(signedOut.status, 401);
      assert.equal(errorCode(signedOut.body), "UNAUTHORIZED");

      const forbidden = await patchApi(
        otherCookie,
        String(api.id),
        JSON.stringify({ name: "Stolen", status: "DISABLED" }),
      );
      assert.equal(forbidden.status, 404);
      assert.equal(errorCode(forbidden.body), "NOT_FOUND");

      for (const apiId of ["nope", "0", "1.5", "9999999999"]) {
        const invalid = await patchApi(
          ownerCookie,
          apiId,
          JSON.stringify({ name: "Nope" }),
        );
        assert.equal(invalid.status, 404);
        assert.equal(errorCode(invalid.body), "NOT_FOUND");
      }

      const missing = await patchApi(
        ownerCookie,
        "2147483646",
        JSON.stringify({ status: "DISABLED" }),
      );
      assert.equal(missing.status, 404);
      assert.equal(errorCode(missing.body), "NOT_FOUND");

      const empty = await patchApi(ownerCookie, String(api.id), "");
      assert.equal(empty.status, 400);
      assert.equal(errorCode(empty.body), "INVALID_INPUT");

      const invalidJson = await patchApi(ownerCookie, String(api.id), "{");
      assert.equal(invalidJson.status, 400);
      assert.equal(errorCode(invalidJson.body), "INVALID_INPUT");

      const slugOnly = await patchApi(
        ownerCookie,
        String(api.id),
        JSON.stringify({ slug: "changed-slug" }),
      );
      assert.equal(slugOnly.status, 400);
      assert.equal(errorCode(slugOnly.body), "INVALID_INPUT");

      const badStatus = await patchApi(
        ownerCookie,
        String(api.id),
        JSON.stringify({ name: "Still original", status: "paused" }),
      );
      assert.equal(badStatus.status, 400);
      assert.equal(errorCode(badStatus.body), "INVALID_INPUT");

      const badName = await patchApi(
        ownerCookie,
        String(api.id),
        JSON.stringify({ name: "   " }),
      );
      assert.equal(badName.status, 400);
      assert.equal(errorCode(badName.body), "INVALID_INPUT");

      const unchanged = await prisma.api.findUnique({ where: { id: api.id } });
      assert.equal(unchanged?.name, "Original name");
      assert.equal(unchanged?.slug, api.slug);
      assert.equal(unchanged?.status, "ACTIVE");
      assert.equal(unchanged?.spreadsheetId, spreadsheet.spreadsheetId);
      assert.equal(unchanged?.worksheetId, 4);
      assert.equal(unchanged?.worksheetName, "Sheet1");

      const renamed = await patchApi(
        ownerCookie,
        String(api.id),
        JSON.stringify({
          name: "  Renamed   API ",
          slug: "changed-slug",
          spreadsheetId: "other-sheet",
          worksheetId: 99,
          worksheetName: "Other",
        }),
      );
      assert.equal(renamed.status, 200);
      const renamedApi = managedApi(renamed.body);
      assert.equal(renamedApi.name, "Renamed API");
      assert.equal(renamedApi.slug, api.slug);
      assert.equal(renamedApi.spreadsheetId, spreadsheet.spreadsheetId);
      assert.equal(renamedApi.worksheetId, 4);
      assert.equal(renamedApi.worksheetName, "Sheet1");
      assert.equal(renamedApi.status, "ACTIVE");
      assert.equal(JSON.stringify(renamed.body).includes(created.secret), false);
      assert.equal(JSON.stringify(renamed.body).includes(beforeKey.keyHash), false);

      const afterRename = await prisma.api.findUnique({ where: { id: api.id } });
      assert.equal(afterRename?.name, "Renamed API");
      assert.equal(afterRename?.slug, api.slug);
      assert.equal(afterRename?.spreadsheetId, spreadsheet.spreadsheetId);
      assert.equal(afterRename?.worksheetId, 4);
      assert.equal(afterRename?.worksheetName, "Sheet1");
      const afterKey = await prisma.apiKey.findUnique({
        where: { id: created.key.id },
      });
      assert.equal(afterKey?.keyHash, beforeKey.keyHash);
      assert.equal(afterKey?.keyPrefix, beforeKey.keyPrefix);
      assert.equal(afterKey?.revokedAt, null);
      assert.equal(afterKey?.name, "Website");

      const disabled = await patchApi(
        ownerCookie,
        String(api.id),
        JSON.stringify({ status: "DISABLED" }),
      );
      assert.equal(disabled.status, 200);
      assert.equal(managedApi(disabled.body).status, "DISABLED");
      assert.equal(managedApi(disabled.body).slug, api.slug);
      assert.equal(managedApi(disabled.body).name, "Renamed API");

      const blocked = await callPublic(api.slug, `Bearer ${created.secret}`);
      assert.equal(blocked.status, 403);
      assert.equal(errorCode(blocked.body), "API_DISABLED");
      assert.equal(
        (blocked.body as { error?: { message?: string } }).error?.message,
        "This API is disabled.",
      );
      const unused = await prisma.apiKey.findUnique({
        where: { id: created.key.id },
        select: { lastUsedAt: true, revokedAt: true },
      });
      assert.equal(unused?.lastUsedAt, null);
      assert.equal(unused?.revokedAt, null);

      const enabled = await patchApi(
        ownerCookie,
        String(api.id),
        JSON.stringify({ status: "ACTIVE" }),
      );
      assert.equal(enabled.status, 200);
      assert.equal(managedApi(enabled.body).status, "ACTIVE");
      assert.equal(managedApi(enabled.body).slug, api.slug);

      const restored = await callPublic(api.slug, `Bearer ${created.secret}`);
      assert.equal(restored.status, 503);
      assert.equal(errorCode(restored.body), "GOOGLE_NOT_CONNECTED");
      const used = await prisma.apiKey.findUnique({
        where: { id: created.key.id },
        select: { lastUsedAt: true },
      });
      assert.ok(used?.lastUsedAt);

      const revoked = await revokeKey(ownerCookie, api.id, created.key.id);
      assert.equal(revoked.status, 200);
      const revokedRead = await callPublic(api.slug, `Bearer ${created.secret}`);
      assert.equal(revokedRead.status, 401);
      assert.equal(errorCode(revokedRead.body), "INVALID_API_KEY");

      const keptRow = await prisma.api.findUnique({ where: { id: kept.id } });
      assert.equal(keptRow?.name, "Keep me");
      assert.equal(keptRow?.slug, kept.slug);
      assert.equal(keptRow?.status, "ACTIVE");
      const saved = await prisma.selectedSpreadsheet.findUnique({
        where: { id: spreadsheet.id },
      });
      assert.equal(saved?.name, "Keep this spreadsheet");
      assert.equal(saved?.spreadsheetId, spreadsheet.spreadsheetId);

      const removed = await deleteApi(ownerCookie, api.id);
      assert.equal(removed.status, 200);
      assert.deepEqual(removed.body, { success: true });
      assert.equal(
        await prisma.api.findUnique({ where: { id: api.id }, select: { id: true } }),
        null,
      );
      assert.equal(
        await prisma.apiKey.findUnique({
          where: { keyHash: hashApiKey(created.secret) },
        }),
        null,
      );
      assert.ok(await prisma.api.findUnique({ where: { id: kept.id } }));
      assert.ok(
        await prisma.apiKey.findUnique({
          where: { keyHash: hashApiKey(keptKey.secret) },
        }),
      );
      const gone = await callPublic(api.slug, `Bearer ${created.secret}`);
      assert.equal(gone.status, 404);
      assert.equal(errorCode(gone.body), "NOT_FOUND");
      const stillSaved = await prisma.selectedSpreadsheet.findUnique({
        where: { id: spreadsheet.id },
      });
      assert.equal(stillSaved?.spreadsheetId, spreadsheet.spreadsheetId);
    } finally {
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, otherEmail] } },
      });
    }
  });

  it("stops and restores spreadsheet reads without changing the sheet", (t) =>
    withConnectedAccountLock(async () => {
    const connection = await prisma.googleConnection.findFirst({
      select: { userId: true },
    });

    if (!connection) {
      t.skip("blocked: no connected Google account");
      return;
    }

    const savedCandidates = await prisma.selectedSpreadsheet.findMany({
      where: { userId: connection.userId },
      orderBy: { id: "desc" },
      select: { id: true, spreadsheetId: true, name: true },
    });
    let savedBefore: (typeof savedCandidates)[number] | null = null;
    let worksheet: { id: number; title: string } | null = null;

    for (const candidate of savedCandidates) {
      try {
        const spreadsheet = await withGoogleAccessToken(
          connection.userId,
          (accessToken) =>
            readSpreadsheetWorksheets(accessToken, candidate.spreadsheetId),
        );
        const firstSheet = spreadsheet.sheets[0];

        if (firstSheet) {
          savedBefore = candidate;
          worksheet = firstSheet;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!savedBefore || !worksheet) {
      t.skip("blocked: connected account has no readable saved spreadsheet");
      return;
    }

    const linkedSheet = savedBefore;
    const linkedWorksheet = worksheet;
    const apisBefore = await prisma.api.findMany({
      where: { userId: connection.userId },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    const before = await withGoogleAccessToken(connection.userId, (accessToken) =>
      readWorksheetRecords(
        accessToken,
        linkedSheet.spreadsheetId,
        linkedWorksheet.id,
      ),
    );
    const beforeHash = createHash("sha256")
      .update(JSON.stringify(before.rows))
      .digest("hex");
    const temporary = await prisma.api.create({
      data: {
        userId: connection.userId,
        name: "Temporary manage check",
        slug: `mng${stamp}g`,
        spreadsheetId: linkedSheet.spreadsheetId,
        worksheetId: linkedWorksheet.id,
        worksheetName: linkedWorksheet.title,
      },
    });
    const cookie = `auth_token=${createAuthToken(connection.userId)}`;
    let keyId: number | null = null;

    try {
      const created = await createOwnedApiKey(
        connection.userId,
        temporary.id,
        "Temporary",
      );
      assert.equal(created.ok, true);

      if (!created.ok) {
        return;
      }

      keyId = created.key.id;
      const served = await callPublic(temporary.slug, `Bearer ${created.secret}`);
      assert.equal(served.status, 200);
      assert.equal(Array.isArray(served.body), true);
      assert.equal(
        createHash("sha256").update(JSON.stringify(served.body)).digest("hex"),
        beforeHash,
      );

      const renamed = await patchApi(
        cookie,
        String(temporary.id),
        JSON.stringify({ name: "Renamed temporary", slug: "not-the-slug" }),
      );
      assert.equal(renamed.status, 200);
      assert.equal(managedApi(renamed.body).name, "Renamed temporary");
      assert.equal(managedApi(renamed.body).slug, temporary.slug);
      const renamedRow = await prisma.api.findUnique({ where: { id: temporary.id } });
      assert.equal(renamedRow?.slug, temporary.slug);
      assert.equal(renamedRow?.spreadsheetId, linkedSheet.spreadsheetId);
      assert.equal(renamedRow?.worksheetId, linkedWorksheet.id);
      const keyAfterRename = await prisma.apiKey.findUnique({
        where: { id: created.key.id },
      });
      assert.equal(keyAfterRename?.keyHash, hashApiKey(created.secret));
      assert.equal(keyAfterRename?.revokedAt, null);

      const stillServed = await callPublic(temporary.slug, `Bearer ${created.secret}`);
      assert.equal(stillServed.status, 200);
      assert.equal(
        createHash("sha256").update(JSON.stringify(stillServed.body)).digest("hex"),
        beforeHash,
      );

      const disabled = await patchApi(
        cookie,
        String(temporary.id),
        JSON.stringify({ status: "DISABLED" }),
      );
      assert.equal(disabled.status, 200);
      assert.equal(managedApi(disabled.body).status, "DISABLED");
      const blocked = await callPublic(temporary.slug, `Bearer ${created.secret}`);
      assert.equal(blocked.status, 403);
      assert.equal(errorCode(blocked.body), "API_DISABLED");
      assert.equal(Array.isArray(blocked.body), false);

      const during = await withGoogleAccessToken(connection.userId, (accessToken) =>
        readWorksheetRecords(
          accessToken,
          linkedSheet.spreadsheetId,
          linkedWorksheet.id,
        ),
      );
      assert.equal(
        createHash("sha256").update(JSON.stringify(during.rows)).digest("hex"),
        beforeHash,
      );

      const enabled = await patchApi(
        cookie,
        String(temporary.id),
        JSON.stringify({ status: "ACTIVE" }),
      );
      assert.equal(enabled.status, 200);
      const restored = await callPublic(temporary.slug, `Bearer ${created.secret}`);
      assert.equal(restored.status, 200);
      assert.equal(Array.isArray(restored.body), true);
      assert.equal(
        createHash("sha256").update(JSON.stringify(restored.body)).digest("hex"),
        beforeHash,
      );

      const revoked = await revokeKey(cookie, temporary.id, created.key.id);
      assert.equal(revoked.status, 200);
      const revokedRead = await callPublic(temporary.slug, `Bearer ${created.secret}`);
      assert.equal(revokedRead.status, 401);
      assert.equal(errorCode(revokedRead.body), "INVALID_API_KEY");

      const removed = await deleteApi(cookie, temporary.id);
      assert.equal(removed.status, 200);
      const gone = await callPublic(temporary.slug, `Bearer ${created.secret}`);
      assert.equal(gone.status, 404);
      assert.equal(errorCode(gone.body), "NOT_FOUND");

      const after = await withGoogleAccessToken(connection.userId, (accessToken) =>
        readWorksheetRecords(
          accessToken,
          linkedSheet.spreadsheetId,
          linkedWorksheet.id,
        ),
      );
      assert.equal(
        createHash("sha256").update(JSON.stringify(after.rows)).digest("hex"),
        beforeHash,
      );
      const savedAfter = await prisma.selectedSpreadsheet.findUnique({
        where: { id: linkedSheet.id },
      });
      assert.equal(savedAfter?.spreadsheetId, linkedSheet.spreadsheetId);
      assert.equal(savedAfter?.name, linkedSheet.name);
      const apisAfter = await prisma.api.findMany({
        where: { userId: connection.userId },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      assert.deepEqual(apisAfter, apisBefore);
    } finally {
      if (keyId != null) {
        await prisma.apiKey.deleteMany({ where: { id: keyId } });
      }

      await prisma.api.deleteMany({ where: { id: temporary.id } });
    }
    }),
  );
});

after(async () => {
  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});
