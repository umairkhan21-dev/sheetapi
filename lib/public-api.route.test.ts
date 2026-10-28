import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, afterEach, describe, it } from "node:test";
import { GET } from "../app/api/v1/[slug]/route";
import { createOwnedApiKey } from "./api-key-store";
import { API_DATA_ROW_LIMIT } from "./google-worksheets";
import {
  PUBLIC_API_LIMIT_MAX,
  PUBLIC_API_OFFSET_MAX,
} from "./public-api-pagination";
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
    const opened = await callPublic(fixture.api.slug, `Bearer ${fixture.secret}`);

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
      first.some((call) => call.method !== "GET"),
      false,
    );

    const overridden = await callPublic(
      fixture.api.slug,
      `Bearer ${fixture.secret}`,
      "?spreadsheetId=other-sheet&api_key=ignored",
    );
    assert.equal(overridden.status, 400);
    assert.equal(errorCode(overridden.body).code, "INVALID_INPUT");
    assert.equal(
      errorCode(overridden.body).message,
      "spreadsheetId is not a column in this worksheet.",
    );
    assert.equal(overridden.text.includes("isolated-access-token"), false);
    assert.equal(overridden.text.includes(fixture.secret), false);
    assert.equal(overridden.text.includes("Pen"), false);
    assert.equal(
      first.some((call) => call.path.includes("other-sheet")),
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

  it("paginates data rows and rejects invalid limit or offset", async () => {
    const fixture = await createFixture("page");
    await prisma.googleConnection.create({
      data: {
        userId: fixture.user.id,
        googleAccountId: `google-${fixture.user.id}`,
        accessToken: "isolated-access-token",
        refreshToken: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const calls = installGoogle({
      values: [
        ["id", "name", "price", ""],
        ["1", "Pen", "20", ""],
        ["2", "Book", "100", "yes"],
        ["", ""],
        ["4", "Paper", "5", ""],
        ["5", "Ink", "8", ""],
      ],
    });
    const bearer = `Bearer ${fixture.secret}`;

    const invalidQueries: Array<[string, string]> = [
      ["?limit=0", `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`],
      ["?limit=-1", `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`],
      ["?limit=1.5", `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`],
      ["?limit=", `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`],
      ["?limit=abc", `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`],
      ["?limit=1e2", `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`],
      [
        `?limit=${PUBLIC_API_LIMIT_MAX + 1}`,
        `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`,
      ],
      ["?offset=-1", `offset must be a whole number from 0 to ${PUBLIC_API_OFFSET_MAX}.`],
      ["?offset=1.5", `offset must be a whole number from 0 to ${PUBLIC_API_OFFSET_MAX}.`],
      ["?offset=", `offset must be a whole number from 0 to ${PUBLIC_API_OFFSET_MAX}.`],
      ["?offset=nope", `offset must be a whole number from 0 to ${PUBLIC_API_OFFSET_MAX}.`],
      [
        "?offset=9007199254740992",
        `offset must be a whole number from 0 to ${PUBLIC_API_OFFSET_MAX}.`,
      ],
      [
        "?limit=2&offset=1.2",
        `offset must be a whole number from 0 to ${PUBLIC_API_OFFSET_MAX}.`,
      ],
      ["?limit=1&limit=2", `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`],
    ];

    for (const [query, message] of invalidQueries) {
      const rejected = await callPublic(fixture.api.slug, bearer, query);
      assert.equal(rejected.status, 400, query);
      assert.equal(errorCode(rejected.body).code, "INVALID_INPUT");
      assert.equal(errorCode(rejected.body).message, message);
      assert.equal(Array.isArray(rejected.body), false);
    }

    const bothInvalid = await callPublic(
      fixture.api.slug,
      bearer,
      "?limit=0&offset=-4",
    );
    assert.equal(bothInvalid.status, 400);
    assert.equal(
      errorCode(bothInvalid.body).message,
      `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`,
    );
    assert.equal(
      (
        await prisma.apiKey.findUnique({
          where: { id: fixture.keyId },
          select: { lastUsedAt: true },
        })
      )?.lastUsedAt,
      null,
    );
    assert.equal(calls.length, 0);

    const missingKey = await callPublic(fixture.api.slug, undefined, "?limit=0");
    assert.equal(missingKey.status, 401);
    assert.equal(errorCode(missingKey.body).code, "INVALID_API_KEY");

    const queryKey = await callPublic(
      fixture.api.slug,
      undefined,
      `?limit=1&api_key=${encodeURIComponent(fixture.secret)}`,
    );
    assert.equal(queryKey.status, 401);
    assert.equal(queryKey.text.includes(fixture.secret), false);

    await prisma.api.update({
      where: { id: fixture.api.id },
      data: { status: "DISABLED" },
    });
    const disabled = await callPublic(fixture.api.slug, bearer, "?limit=0");
    assert.equal(disabled.status, 403);
    assert.equal(errorCode(disabled.body).code, "API_DISABLED");
    assert.equal(disabled.text.includes("Pen"), false);
    await prisma.api.update({
      where: { id: fixture.api.id },
      data: { status: "ACTIVE" },
    });
    assert.equal(calls.length, 0);

    const paged = await callPublic(fixture.api.slug, bearer, "?limit=3&offset=0");
    assert.equal(paged.status, 200);
    assert.match(paged.type ?? "", /application\/json/);
    assert.equal(paged.cache, "no-store");
    assert.equal(Array.isArray(paged.body), true);
    assert.equal(JSON.stringify(paged.body).includes("pagination"), false);
    assert.deepEqual(paged.body, [
      { id: "1", name: "Pen", price: "20", "Column 4": "" },
      { id: "2", name: "Book", price: "100", "Column 4": "yes" },
      { id: "", name: "", price: "", "Column 4": "" },
    ]);
    assert.equal(
      calls.some(
        (call) =>
          call.path.includes("/values/") &&
          call.path.includes(String(API_DATA_ROW_LIMIT + 2)) &&
          call.path.includes(fixture.spreadsheetId),
      ),
      true,
    );

    const limitOnly = await callPublic(fixture.api.slug, bearer, "?limit=1");
    assert.deepEqual(limitOnly.body, [
      { id: "1", name: "Pen", price: "20", "Column 4": "" },
    ]);

    const offsetOnly = await callPublic(fixture.api.slug, bearer, "?offset=2");
    assert.deepEqual(offsetOnly.body, [
      { id: "", name: "", price: "", "Column 4": "" },
      { id: "4", name: "Paper", price: "5", "Column 4": "" },
      { id: "5", name: "Ink", price: "8", "Column 4": "" },
    ]);

    const nextPage = await callPublic(
      fixture.api.slug,
      bearer,
      "?limit=1&offset=1",
    );
    assert.deepEqual(nextPage.body, [
      { id: "2", name: "Book", price: "100", "Column 4": "yes" },
    ]);
    assert.deepEqual(
      Object.keys((nextPage.body as Record<string, string>[])[0] ?? {}),
      Object.keys((limitOnly.body as Record<string, string>[])[0] ?? {}),
    );

    const pastEnd = await callPublic(fixture.api.slug, bearer, "?offset=20");
    assert.equal(pastEnd.status, 200);
    assert.deepEqual(pastEnd.body, []);

    const unchanged = await callPublic(fixture.api.slug, bearer);
    assert.equal(unchanged.body && Array.isArray(unchanged.body), true);
    assert.equal((unchanged.body as unknown[]).length, 5);

    installGoogle({ values: [] });
    const empty = await callPublic(fixture.api.slug, bearer, "?limit=3&offset=1");
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, []);

    installGoogle({ values: [["id", "name"]] });
    const headerOnly = await callPublic(fixture.api.slug, bearer, "?offset=0");
    assert.deepEqual(headerOnly.body, []);

    installGoogle({
      values: Array.from({ length: API_DATA_ROW_LIMIT + 2 }, () => ["x"]),
    });
    const tooLarge = await callPublic(fixture.api.slug, bearer, "?limit=1");
    assert.equal(tooLarge.status, 413);
    assert.equal(errorCode(tooLarge.body).code, "WORKSHEET_TOO_LARGE");
    assert.equal(tooLarge.text.includes('"x"'), false);

    installGoogle({ metadataStatus: 401 });
    const reauth = await callPublic(fixture.api.slug, bearer, "?offset=1&limit=2");
    assert.equal(reauth.status, 503);
    assert.equal(errorCode(reauth.body).code, "GOOGLE_REAUTH_REQUIRED");
    assert.equal(Array.isArray(reauth.body), false);
  });

  it("filters mapped rows before pagination and rejects invalid filters", async () => {
    const fixture = await createFixture("filter");
    await prisma.googleConnection.create({
      data: {
        userId: fixture.user.id,
        googleAccountId: `google-${fixture.user.id}`,
        accessToken: "isolated-access-token",
        refreshToken: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const calls = installGoogle({
      values: [
        ["id", "name", "city"],
        ["1", "raven", "london"],
        ["2", "tony", "middle earth"],
        ["3", "hermoine", "london"],
        ["4", "harry", "london"],
      ],
    });
    const bearer = `Bearer ${fixture.secret}`;

    const invalidQueries: Array<[string, string]> = [
      ["?city=", "city must not be empty."],
      ["?city", "city must not be empty."],
      ["?name=tony&city=", "city must not be empty."],
      ["?city=london&city=paris", "city was provided more than once."],
      ["?city=london&city=london", "city was provided more than once."],
      ["?limit=0&city=london", `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`],
      ["?city=london&offset=-1", `offset must be a whole number from 0 to ${PUBLIC_API_OFFSET_MAX}.`],
      ["?city=london&limit=1&limit=2", `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`],
      ["?offset=1&offset=2&city=london", `offset must be a whole number from 0 to ${PUBLIC_API_OFFSET_MAX}.`],
      ["?name__contains=", "name__contains must not be empty."],
      ["?q=", "q must not be empty."],
      ["?q", "q must not be empty."],
      ["?q=pen&q=ton", "q was provided more than once."],
      ["?name__starts=a&name__starts=b", "name__starts was provided more than once."],
      ["?limit=0&q=pen", `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`],
      ["?limit=0&name__contains=a", `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`],
    ];

    for (const [query, message] of invalidQueries) {
      const rejected = await callPublic(fixture.api.slug, bearer, query);
      assert.equal(rejected.status, 400, query);
      assert.equal(errorCode(rejected.body).code, "INVALID_INPUT");
      assert.equal(errorCode(rejected.body).message, message);
      assert.equal(Array.isArray(rejected.body), false);
      assert.equal(rejected.text.includes("raven"), false);
    }

    assert.equal(calls.length, 0);
    assert.equal(
      (
        await prisma.apiKey.findUnique({
          where: { id: fixture.keyId },
          select: { lastUsedAt: true },
        })
      )?.lastUsedAt,
      null,
    );

    const missingKey = await callPublic(fixture.api.slug, undefined, "?city=london");
    assert.equal(missingKey.status, 401);
    assert.equal(errorCode(missingKey.body).code, "INVALID_API_KEY");
    assert.equal(errorCode(missingKey.body).message, "A valid API key is required.");

    const invalidKey = await callPublic(
      fixture.api.slug,
      "Bearer not-a-key",
      "?city=london&name=tony",
    );
    assert.equal(invalidKey.status, 401);
    assert.equal(errorCode(invalidKey.body).message, "The API key is invalid or revoked.");

    const queryKey = await callPublic(
      fixture.api.slug,
      undefined,
      `?city=london&api_key=${encodeURIComponent(fixture.secret)}`,
    );
    assert.equal(queryKey.status, 401);
    assert.equal(queryKey.text.includes(fixture.secret), false);

    await prisma.api.update({
      where: { id: fixture.api.id },
      data: { status: "DISABLED" },
    });
    const disabled = await callPublic(fixture.api.slug, bearer, "?city=london");
    assert.equal(disabled.status, 403);
    assert.equal(errorCode(disabled.body).code, "API_DISABLED");
    assert.equal(disabled.text.includes("raven"), false);
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
    assert.equal(calls.length, 0);

    const unfiltered = await callPublic(fixture.api.slug, bearer);
    assert.equal(unfiltered.status, 200);
    assert.match(unfiltered.type ?? "", /application\/json/);
    assert.equal(unfiltered.cache, "no-store");
    assert.deepEqual(unfiltered.body, [
      { id: "1", name: "raven", city: "london" },
      { id: "2", name: "tony", city: "middle earth" },
      { id: "3", name: "hermoine", city: "london" },
      { id: "4", name: "harry", city: "london" },
    ]);

    const london = await callPublic(fixture.api.slug, bearer, "?city=london");
    assert.equal(london.status, 200);
    assert.deepEqual(london.body, [
      { id: "1", name: "raven", city: "london" },
      { id: "3", name: "hermoine", city: "london" },
      { id: "4", name: "harry", city: "london" },
    ]);

    const tony = await callPublic(fixture.api.slug, bearer, "?name=tony");
    assert.deepEqual(tony.body, [
      { id: "2", name: "tony", city: "middle earth" },
    ]);

    const none = await callPublic(fixture.api.slug, bearer, "?city=paris");
    assert.equal(none.status, 200);
    assert.deepEqual(none.body, []);

    const both = await callPublic(
      fixture.api.slug,
      bearer,
      "?city=london&name=hermoine",
    );
    assert.deepEqual(both.body, [
      { id: "3", name: "hermoine", city: "london" },
    ]);

    const differentCase = await callPublic(fixture.api.slug, bearer, "?city=London");
    assert.equal(differentCase.status, 200);
    assert.deepEqual(differentCase.body, []);

    const substring = await callPublic(fixture.api.slug, bearer, "?name=ton");
    assert.deepEqual(substring.body, []);

    const contains = await callPublic(fixture.api.slug, bearer, "?name__contains=herm");
    assert.equal(contains.status, 200);
    assert.deepEqual(contains.body, [
      { id: "3", name: "hermoine", city: "london" },
    ]);

    const searchAnd = await callPublic(
      fixture.api.slug,
      bearer,
      "?q=on&city__starts=middle",
    );
    assert.equal(searchAnd.status, 200);
    assert.deepEqual(searchAnd.body, [
      { id: "2", name: "tony", city: "middle earth" },
    ]);

    const wildcard = await callPublic(fixture.api.slug, bearer, "?name__wildcard=h*e");
    assert.deepEqual(wildcard.body, [
      { id: "3", name: "hermoine", city: "london" },
    ]);

    const insensitive = await callPublic(fixture.api.slug, bearer, "?name__icontains=HERM");
    assert.deepEqual(insensitive.body, [
      { id: "3", name: "hermoine", city: "london" },
    ]);

    const paged = await callPublic(
      fixture.api.slug,
      bearer,
      "?city=london&limit=2&offset=1",
    );
    assert.deepEqual(paged.body, [
      { id: "3", name: "hermoine", city: "london" },
      { id: "4", name: "harry", city: "london" },
    ]);

    const injection = await callPublic(
      fixture.api.slug,
      bearer,
      "?name=tony%27%3B%20DROP%20TABLE%20api",
    );
    assert.equal(injection.status, 200);
    assert.deepEqual(injection.body, []);
    assert.equal(Array.isArray(injection.body), true);

    const unknownOperator = await callPublic(
      fixture.api.slug,
      bearer,
      "?town__contains=lon",
    );
    assert.equal(unknownOperator.status, 400);
    assert.equal(errorCode(unknownOperator.body).code, "INVALID_INPUT");
    assert.equal(
      errorCode(unknownOperator.body).message,
      "town is not a column in this worksheet.",
    );
    assert.equal(unknownOperator.text.includes("raven"), false);

    const unknown = await callPublic(fixture.api.slug, bearer, "?town=london");
    assert.equal(unknown.status, 400);
    assert.equal(errorCode(unknown.body).code, "INVALID_INPUT");
    assert.equal(
      errorCode(unknown.body).message,
      "town is not a column in this worksheet.",
    );
    assert.equal(unknown.text.includes("raven"), false);
    assert.equal(
      (
        await prisma.apiKey.findUnique({
          where: { id: fixture.keyId },
          select: { lastUsedAt: true },
        })
      )?.lastUsedAt instanceof Date,
      true,
    );

    const wrongColumnCase = await callPublic(fixture.api.slug, bearer, "?City=london");
    assert.equal(wrongColumnCase.status, 400);
    assert.equal(
      errorCode(wrongColumnCase.body).message,
      "City is not a column in this worksheet.",
    );

    installGoogle({ values: [] });
    const emptyFiltered = await callPublic(fixture.api.slug, bearer, "?city=london");
    assert.equal(emptyFiltered.status, 400);
    assert.equal(
      errorCode(emptyFiltered.body).message,
      "city is not a column in this worksheet.",
    );
    const empty = await callPublic(fixture.api.slug, bearer);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, []);

    installGoogle({ values: [["id", "name", "city"]] });
    const headerFiltered = await callPublic(fixture.api.slug, bearer, "?city=london");
    assert.equal(headerFiltered.status, 200);
    assert.deepEqual(headerFiltered.body, []);
    const headerUnknown = await callPublic(fixture.api.slug, bearer, "?town=london");
    assert.equal(headerUnknown.status, 400);
    assert.equal(errorCode(headerUnknown.body).code, "INVALID_INPUT");

    installGoogle({
      values: Array.from({ length: API_DATA_ROW_LIMIT + 2 }, () => ["x"]),
    });
    const tooLarge = await callPublic(fixture.api.slug, bearer, "?city=london&limit=1");
    assert.equal(tooLarge.status, 413);
    assert.equal(errorCode(tooLarge.body).code, "WORKSHEET_TOO_LARGE");
    assert.equal(tooLarge.text.includes('"x"'), false);

    installGoogle({
      values: Array.from({ length: API_DATA_ROW_LIMIT + 2 }, () => ["x"]),
    });
    const tooLargeSearch = await callPublic(
      fixture.api.slug,
      bearer,
      "?q=x&name__contains=x",
    );
    assert.equal(tooLargeSearch.status, 413);
    assert.equal(errorCode(tooLargeSearch.body).code, "WORKSHEET_TOO_LARGE");
    assert.equal(tooLargeSearch.text.includes('"x"'), false);

    installGoogle({ metadataStatus: 401 });
    const reauth = await callPublic(fixture.api.slug, bearer, "?city=london");
    assert.equal(reauth.status, 503);
    assert.equal(errorCode(reauth.body).code, "GOOGLE_REAUTH_REQUIRED");
    assert.equal(Array.isArray(reauth.body), false);

    installGoogle({ failNetwork: true });
    const offline = await callPublic(fixture.api.slug, bearer, "?name=tony");
    assert.equal(offline.status, 503);
    assert.equal(errorCode(offline.body).code, "GOOGLE_UNAVAILABLE");
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
