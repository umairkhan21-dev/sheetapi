import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, afterEach, describe, it } from "node:test";
import { GET } from "../app/api/v1/[slug]/route";
import { createOwnedApiKey } from "./api-key-store";
import { API_DATA_ROW_LIMIT } from "./google-worksheets";
import { prisma } from "./prisma";

const originalFetch = globalThis.fetch;
const createdEmails: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type GoogleCall = {
  method: string;
  path: string;
};

function installGoogle(options: {
  values?: string[][];
  sheetId?: number;
  title?: string;
  metadataStatus?: number;
  valuesStatus?: number;
  failNetwork?: boolean;
  refreshStatus?: number;
}) {
  const calls: GoogleCall[] = [];
  const sheetId = options.sheetId ?? 0;
  const title = options.title ?? "Sheet1";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const path = url.split("?")[0] ?? url;
    calls.push({
      method,
      path,
    });

    if (options.failNetwork) {
      throw new Error("network down");
    }

    if (url.includes("oauth2.googleapis.com/token")) {
      return Response.json(
        { error: "invalid_grant" },
        { status: options.refreshStatus ?? 400 },
      );
    }

    if (url.includes("/values/")) {
      if (options.valuesStatus) {
        return Response.json(
          { error: { errors: [{ reason: "authError" }] } },
          { status: options.valuesStatus },
        );
      }

      return Response.json({ values: options.values ?? [] });
    }

    if (options.metadataStatus) {
      return Response.json(
        { error: { errors: [{ reason: "authError" }] } },
        { status: options.metadataStatus },
      );
    }

    const spreadsheetId = path.split("/spreadsheets/")[1] ?? "";

    return Response.json({
      spreadsheetId,
      properties: { title: "Products" },
      sheets: [
        {
          properties: { sheetId, title, index: 0 },
        },
      ],
    });
  };

  return calls;
}

async function callPublic(slug: string, authorization?: string, query = "") {
  const headers = new Headers();

  if (authorization) {
    headers.set("authorization", authorization);
  }

  const response = await GET(
    new Request(`http://localhost/api/v1/${slug}${query}`, { headers }),
    { params: Promise.resolve({ slug }) },
  );
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    body,
    text,
    cache: response.headers.get("cache-control"),
    type: response.headers.get("content-type"),
  };
}

function errorCode(body: unknown) {
  assert.equal(Array.isArray(body), false);
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  const record = body as {
    success?: unknown;
    error?: { code?: unknown; message?: unknown };
  };
  assert.equal(record.success, false);
  return {
    code: record.error?.code,
    message: record.error?.message,
  };
}

async function createFixture(label: string) {
  const id = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  const address = `public-api-${id}-${label}@example.com`;
  createdEmails.push(address);
  const user = await prisma.user.create({
    data: {
      name: "Public API owner",
      email: address,
      password: "not-used",
    },
  });
  const spreadsheetId = `sheet-${id}`;
  await prisma.selectedSpreadsheet.create({
    data: {
      userId: user.id,
      spreadsheetId,
      name: "Products",
    },
  });
  const api = await prisma.api.create({
    data: {
      userId: user.id,
      name: "Products API",
      slug: `pub${id.replace(/[^a-z0-9]/g, "")}`,
      spreadsheetId,
      worksheetId: 0,
      worksheetName: "Sheet1",
    },
  });
  const created = await createOwnedApiKey(user.id, api.id, "Website");
  assert.equal(created.ok, true);

  if (!created.ok) {
    throw new Error("API key was not created");
  }

  return { user, api, spreadsheetId, secret: created.secret, keyId: created.key.id };
}

describe("public worksheet endpoint", { concurrency: 1 }, () => {
  it("returns the current worksheet JSON and a later Google snapshot", async () => {
    const fixture = await createFixture("live");
    await prisma.googleConnection.create({
      data: {
        userId: fixture.user.id,
        googleAccountId: `google-${fixture.user.id}`,
        accessToken: "isolated-access-token",
        refreshToken: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const first = installGoogle({
      values: [
        ["id", "name", "price"],
        ["1", "Pen", "20"],
      ],
    });
    const opened = await callPublic(
      fixture.api.slug,
      `Bearer ${fixture.secret}`,
      "?spreadsheetId=other-sheet&api_key=ignored",
    );

    assert.equal(opened.status, 200);
    assert.match(opened.type ?? "", /application\/json/);
    assert.equal(opened.cache, "no-store");
    assert.deepEqual(opened.body, [{ id: "1", name: "Pen", price: "20" }]);
    assert.equal(opened.text.includes("isolated-access-token"), false);
    assert.equal(opened.text.includes(fixture.secret), false);
    assert.equal(
      first.some((call) => call.path.includes(fixture.spreadsheetId)),
      true,
    );
    assert.equal(
      first.some((call) => call.path.includes("other-sheet")),
      false,
    );
    assert.equal(
      first.some((call) => call.method !== "GET"),
      false,
    );

    installGoogle({
      values: [
        ["id", "name", "price"],
        ["1", "Pen", "20"],
        ["2", "Book", "100"],
      ],
    });
    const updated = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body, [
      { id: "1", name: "Pen", price: "20" },
      { id: "2", name: "Book", price: "100" },
    ]);
  });

  it("returns no rows for an empty sheet and safe errors for bad Google responses", async () => {
    const fixture = await createFixture("errors");
    await prisma.googleConnection.create({
      data: {
        userId: fixture.user.id,
        googleAccountId: `google-${fixture.user.id}`,
        accessToken: "isolated-access-token",
        refreshToken: "isolated-refresh-token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    installGoogle({ values: [] });
    const empty = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, []);

    installGoogle({ values: [["id", "name"]] });
    const headerOnly = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);
    assert.equal(headerOnly.status, 200);
    assert.deepEqual(headerOnly.body, []);

    const missingSheet = installGoogle({ sheetId: 4, title: "Other" });
    const unknownSheet = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);
    assert.equal(unknownSheet.status, 404);
    assert.equal(errorCode(unknownSheet.body).code, "WORKSHEET_NOT_FOUND");
    assert.equal(
      missingSheet.some((call) => call.path.includes("/values/")),
      false,
    );

    installGoogle({ metadataStatus: 404 });
    const missingSpreadsheet = await callPublic(
      fixture.api.slug,
      `Bearer ${fixture.secret}`,
    );
    assert.equal(missingSpreadsheet.status, 404);
    assert.equal(errorCode(missingSpreadsheet.body).code, "SPREADSHEET_NOT_FOUND");
    assert.equal(missingSpreadsheet.text.includes("isolated-access-token"), false);

    installGoogle({ metadataStatus: 401 });
    const unauthorized = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);
    assert.equal(unauthorized.status, 503);
    assert.equal(errorCode(unauthorized.body).code, "GOOGLE_REAUTH_REQUIRED");
    assert.equal(Array.isArray(unauthorized.body), false);
    assert.equal(unauthorized.text.includes("isolated-refresh-token"), false);

    installGoogle({ failNetwork: true });
    const offline = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);
    assert.equal(offline.status, 503);
    assert.equal(errorCode(offline.body).code, "GOOGLE_UNAVAILABLE");

    installGoogle({
      values: Array.from({ length: API_DATA_ROW_LIMIT + 2 }, () => ["x"]),
    });
    const tooLarge = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);
    assert.equal(tooLarge.status, 413);
    assert.equal(errorCode(tooLarge.body).code, "WORKSHEET_TOO_LARGE");
    assert.equal(tooLarge.text.includes('"x"'), false);

    await prisma.googleConnection.update({
      where: { userId: fixture.user.id },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });
    const refreshCalls = installGoogle({ refreshStatus: 400 });
    const refreshFailed = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);
    assert.equal(refreshFailed.status, 503);
    assert.equal(errorCode(refreshFailed.body).code, "GOOGLE_REAUTH_REQUIRED");
    assert.equal(
      refreshCalls.some((call) => call.path.includes("oauth2.googleapis.com")),
      true,
    );
    assert.equal(
      refreshCalls.some((call) => call.path.includes("/values/")),
      false,
    );
    assert.equal(refreshFailed.text.includes("isolated-refresh-token"), false);
  });

  it("does not read Google Sheets for a missing, revoked, or disabled key", async () => {
    const fixture = await createFixture("guard");
    const other = await prisma.api.create({
      data: {
        userId: fixture.user.id,
        name: "Other API",
        slug: `${fixture.api.slug}b`,
        spreadsheetId: fixture.spreadsheetId,
        worksheetId: 1,
        worksheetName: "Other",
      },
    });
    const otherKey = await createOwnedApiKey(fixture.user.id, other.id, "Other");
    assert.equal(otherKey.ok, true);

    if (!otherKey.ok) {
      return;
    }

    const calls = installGoogle({
      values: [
        ["id", "name"],
        ["1", "Pen"],
      ],
    });

    const unknown = await callPublic(`${fixture.api.slug}missing`);
    assert.equal(unknown.status, 404);
    assert.equal(errorCode(unknown.body).code, "NOT_FOUND");

    const invalidSlug = await callPublic("Not A Slug");
    assert.equal(invalidSlug.status, 404);
    assert.equal(errorCode(invalidSlug.body).code, "NOT_FOUND");

    const missingKey = await callPublic(fixture.api.slug);
    assert.equal(missingKey.status, 401);
    assert.equal(errorCode(missingKey.body).message, "A valid API key is required.");

    for (const query of [
      `?key=${encodeURIComponent(fixture.secret)}`,
      `?api_key=${encodeURIComponent(fixture.secret)}`,
      `?access_token=${encodeURIComponent(fixture.secret)}`,
    ]) {
      const fromQuery = await callPublic(fixture.api.slug, undefined, query);
      assert.equal(fromQuery.status, 401);
      assert.equal(errorCode(fromQuery.body).code, "INVALID_API_KEY");
      assert.equal(fromQuery.text.includes(fixture.secret), false);
    }

    const malformed = await callPublic(fixture.api.slug, "Bearer not-a-key");
    assert.equal(malformed.status, 401);
    assert.equal(
      errorCode(malformed.body).message,
      "The API key is invalid or revoked.",
    );

    const wrongApi = await callPublic(
      fixture.api.slug,
      `Bearer ${otherKey.secret}`,
    );
    assert.equal(wrongApi.status, 401);
    assert.equal(errorCode(wrongApi.body).code, "INVALID_API_KEY");

    await prisma.api.update({
      where: { id: fixture.api.id },
      data: { status: "DISABLED" },
    });
    const disabled = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);
    assert.equal(disabled.status, 403);
    assert.equal(errorCode(disabled.body).code, "API_DISABLED");
    assert.equal(disabled.text.includes("Pen"), false);
    assert.equal(
      (
        await prisma.apiKey.findUnique({
          where: { id: fixture.keyId },
          select: { lastUsedAt: true },
        })
      )?.lastUsedAt,
      null,
    );

    await prisma.api.update({
      where: { id: fixture.api.id },
      data: { status: "ACTIVE" },
    });
    await prisma.selectedSpreadsheet.deleteMany({
      where: { userId: fixture.user.id },
    });
    const removed = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);
    assert.equal(removed.status, 404);
    assert.equal(errorCode(removed.body).code, "SPREADSHEET_NOT_FOUND");
    assert.equal(calls.length, 0);

    await prisma.selectedSpreadsheet.create({
      data: {
        userId: fixture.user.id,
        spreadsheetId: fixture.spreadsheetId,
        name: "Products",
      },
    });
    await prisma.apiKey.update({
      where: { id: fixture.keyId },
      data: { revokedAt: new Date() },
    });
    const revoked = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);
    assert.equal(revoked.status, 401);
    assert.equal(errorCode(revoked.body).code, "INVALID_API_KEY");
    assert.equal(calls.length, 0);

    const replacement = await createOwnedApiKey(
      fixture.user.id,
      fixture.api.id,
      "Replacement",
    );
    assert.equal(replacement.ok, true);

    if (!replacement.ok) {
      return;
    }

    const restored = await callPublic(
      fixture.api.slug,
      `Bearer ${replacement.secret}`,
    );
    assert.equal(restored.status, 503);
    assert.equal(errorCode(restored.body).code, "GOOGLE_NOT_CONNECTED");
    assert.equal(calls.length, 0);

    await prisma.googleConnection.create({
      data: {
        userId: fixture.user.id,
        googleAccountId: `google-${fixture.user.id}`,
        accessToken: "isolated-access-token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const enabled = await callPublic(
      fixture.api.slug,
      `Bearer ${replacement.secret}`,
    );
    assert.equal(enabled.status, 200);
    assert.deepEqual(enabled.body, [{ id: "1", name: "Pen" }]);
    assert.equal(calls.length > 0, true);
  });
});

after(async () => {
  await prisma.user.deleteMany({
    where: { email: { in: createdEmails } },
  });
  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});
