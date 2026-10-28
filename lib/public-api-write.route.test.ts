import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, afterEach, describe, it } from "node:test";
import {
  DELETE,
  PATCH,
  POST,
  PUT,
} from "../app/api/v1/[slug]/route";
import { createOwnedApiKey } from "./api-key-store";
import { prisma } from "./prisma";

const originalFetch = globalThis.fetch;
const createdEmails: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type GoogleCall = {
  method: string;
  path: string;
  body: string | null;
};

function installGoogle(options: {
  values?: string[][];
  sheetId?: number;
  title?: string;
  metadataStatus?: number;
  valuesStatus?: number;
  mutateStatus?: number;
  failNetwork?: boolean;
}) {
  const calls: GoogleCall[] = [];
  const sheetId = options.sheetId ?? 0;
  const title = options.title ?? "Sheet1";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const path = url.split("?")[0] ?? url;
    const body =
      typeof init?.body === "string"
        ? init.body
        : init?.body == null
          ? null
          : String(init.body);
    calls.push({ method, path, body });

    if (options.failNetwork) {
      throw new Error("network down");
    }

    if (url.includes("oauth2.googleapis.com/token")) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }

    if (url.includes(":batchUpdate") || url.includes(":append") || method === "PUT") {
      if (options.mutateStatus) {
        return Response.json(
          { error: { errors: [{ reason: "authError" }] } },
          { status: options.mutateStatus },
        );
      }

      if (url.includes(":append")) {
        return Response.json({
          updates: { updatedRange: "'Sheet1'!A3:C3" },
        });
      }

      return Response.json({ ok: true });
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

    const spreadsheetId = path.split("/spreadsheets/")[1]?.split(":")[0] ?? "";

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

async function callWrite(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  slug: string,
  options: {
    authorization?: string;
    query?: string;
    body?: string;
    contentType?: string | null;
  } = {},
) {
  const headers = new Headers();

  if (options.authorization) {
    headers.set("authorization", options.authorization);
  }

  if (options.contentType === undefined) {
    if (options.body != null) {
      headers.set("content-type", "application/json");
    }
  } else if (options.contentType != null) {
    headers.set("content-type", options.contentType);
  }

  const handlers = { POST, PUT, PATCH, DELETE };
  const response = await handlers[method](
    new Request(`http://localhost/api/v1/${slug}${options.query ?? ""}`, {
      method,
      headers,
      body: options.body,
    }),
    { params: Promise.resolve({ slug }) },
  );
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    body,
    text,
    cache: response.headers.get("cache-control"),
  };
}

function errorCode(body: unknown) {
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
  const address = `public-write-${id}-${label}@example.com`;
  createdEmails.push(address);
  const user = await prisma.user.create({
    data: {
      name: "Public write owner",
      email: address,
      password: "not-used",
    },
  });
  const spreadsheetId = `sheet-write-${id}`;
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
      slug: `wrt${id.replace(/[^a-z0-9]/g, "")}`,
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

  await prisma.googleConnection.create({
    data: {
      userId: user.id,
      googleAccountId: `google-${user.id}`,
      accessToken: "write-access-token",
      refreshToken: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return {
    user,
    api,
    spreadsheetId,
    secret: created.secret,
    keyId: created.key.id,
    bearer: `Bearer ${created.secret}`,
  };
}

describe("public worksheet write endpoints", { concurrency: 1 }, () => {
  it("appends a row with POST in header order", async () => {
    const fixture = await createFixture("post");
    const calls = installGoogle({
      values: [
        ["id", "name", "city"],
        ["1", "ada", "london"],
      ],
    });

    const response = await callWrite("POST", fixture.api.slug, {
      authorization: fixture.bearer,
      body: JSON.stringify({ city: "paris", id: "7", name: "luna" }),
    });

    assert.equal(response.status, 201);
    assert.equal(response.cache, "no-store");
    assert.deepEqual(response.body, {
      success: true,
      row: { id: "7", name: "luna", city: "paris" },
      rowNumber: 3,
    });
    assert.equal(response.text.includes("write-access-token"), false);
    assert.equal(response.text.includes(fixture.secret), false);

    const append = calls.find((call) => call.path.includes(":append"));
    assert.ok(append);
    assert.equal(append?.method, "POST");
    assert.equal(append?.path.includes(fixture.spreadsheetId), true);
    assert.deepEqual(JSON.parse(append?.body ?? "{}"), {
      majorDimension: "ROWS",
      values: [["7", "luna", "paris"]],
    });

    const used = await prisma.apiKey.findUnique({
      where: { id: fixture.keyId },
      select: { lastUsedAt: true },
    });
    assert.notEqual(used?.lastUsedAt, null);
  });

  it("replaces and patches rows with PUT and PATCH", async () => {
    const fixture = await createFixture("put-patch");
    const putCalls = installGoogle({
      values: [
        ["id", "name", "city"],
        ["1", "ada", "london"],
        ["2", "grace", "boston"],
      ],
    });

    const put = await callWrite("PUT", fixture.api.slug, {
      authorization: fixture.bearer,
      query: "?rowNumber=3",
      body: JSON.stringify({ id: "2", city: "rome" }),
    });

    assert.equal(put.status, 200);
    assert.deepEqual(put.body, {
      success: true,
      row: { id: "2", name: "", city: "rome" },
      rowNumber: 3,
    });

    const update = putCalls.find((call) => call.method === "PUT");
    assert.ok(update);
    assert.match(update?.path ?? "", /Sheet1.*A3%3AC3|A3:C3/);
    assert.deepEqual(JSON.parse(update?.body ?? "{}").values, [
      ["2", "", "rome"],
    ]);

    const patchCalls = installGoogle({
      values: [
        ["id", "name", "city"],
        ["1", "ada", "london"],
        ["2", "grace", "boston"],
      ],
    });

    const patch = await callWrite("PATCH", fixture.api.slug, {
      authorization: fixture.bearer,
      query: "?rowNumber=2",
      body: JSON.stringify({ city: "paris" }),
    });

    assert.equal(patch.status, 200);
    assert.deepEqual(patch.body, {
      success: true,
      row: { id: "1", name: "ada", city: "paris" },
      rowNumber: 2,
    });

    const patchUpdate = patchCalls.find((call) => call.method === "PUT");
    assert.ok(patchUpdate);
    assert.deepEqual(JSON.parse(patchUpdate?.body ?? "{}").values, [
      ["1", "ada", "paris"],
    ]);
  });

  it("deletes a data row with zero-based deleteDimension indexes", async () => {
    const fixture = await createFixture("delete");
    const calls = installGoogle({
      values: [
        ["id", "name"],
        ["1", "ada"],
        ["2", "grace"],
      ],
    });

    const response = await callWrite("DELETE", fixture.api.slug, {
      authorization: fixture.bearer,
      query: "?rowNumber=3",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true,
      deleted: true,
      rowNumber: 3,
    });

    const batch = calls.find((call) => call.path.includes(":batchUpdate"));
    assert.ok(batch);
    assert.equal(batch?.method, "POST");
    assert.deepEqual(JSON.parse(batch?.body ?? "{}"), {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: 0,
              dimension: "ROWS",
              startIndex: 2,
              endIndex: 3,
            },
          },
        },
      ],
    });
  });

  it("rejects missing, invalid, revoked, and unauthorized keys before Google writes", async () => {
    const fixture = await createFixture("auth");
    const other = await prisma.api.create({
      data: {
        userId: fixture.user.id,
        name: "Other",
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
        ["1", "ada"],
      ],
    });

    const missing = await callWrite("POST", fixture.api.slug, {
      body: JSON.stringify({ id: "9" }),
    });
    assert.equal(missing.status, 401);
    assert.equal(errorCode(missing.body).code, "INVALID_API_KEY");

    const wrong = await callWrite("POST", fixture.api.slug, {
      authorization: `Bearer ${otherKey.secret}`,
      body: JSON.stringify({ id: "9" }),
    });
    assert.equal(wrong.status, 401);
    assert.equal(errorCode(wrong.body).code, "INVALID_API_KEY");

    await prisma.apiKey.update({
      where: { id: fixture.keyId },
      data: { revokedAt: new Date() },
    });
    const revoked = await callWrite("DELETE", fixture.api.slug, {
      authorization: fixture.bearer,
      query: "?rowNumber=2",
    });
    assert.equal(revoked.status, 401);
    assert.equal(errorCode(revoked.body).code, "INVALID_API_KEY");

    assert.equal(
      calls.some(
        (call) =>
          call.path.includes(":append") ||
          call.path.includes(":batchUpdate") ||
          call.method === "PUT",
      ),
      false,
    );

    const unused = await prisma.apiKey.findUnique({
      where: { id: fixture.keyId },
      select: { lastUsedAt: true },
    });
    assert.equal(unused?.lastUsedAt, null);
  });

  it("rejects disabled APIs and disconnected spreadsheets", async () => {
    const fixture = await createFixture("disabled");
    installGoogle({
      values: [
        ["id", "name"],
        ["1", "ada"],
      ],
    });

    await prisma.api.update({
      where: { id: fixture.api.id },
      data: { status: "DISABLED" },
    });
    const disabled = await callWrite("POST", fixture.api.slug, {
      authorization: fixture.bearer,
      body: JSON.stringify({ id: "9" }),
    });
    assert.equal(disabled.status, 403);
    assert.equal(errorCode(disabled.body).code, "API_DISABLED");

    await prisma.api.update({
      where: { id: fixture.api.id },
      data: { status: "ACTIVE" },
    });
    await prisma.selectedSpreadsheet.deleteMany({
      where: { userId: fixture.user.id },
    });
    const disconnected = await callWrite("PUT", fixture.api.slug, {
      authorization: fixture.bearer,
      query: "?rowNumber=2",
      body: JSON.stringify({ id: "1" }),
    });
    assert.equal(disconnected.status, 404);
    assert.equal(errorCode(disconnected.body).code, "SPREADSHEET_NOT_FOUND");
  });

  it("rejects malformed bodies, unknown columns, and invalid row selectors", async () => {
    const fixture = await createFixture("validation");
    installGoogle({
      values: [
        ["id", "name", "city"],
        ["1", "ada", "london"],
      ],
    });

    const badType = await callWrite("POST", fixture.api.slug, {
      authorization: fixture.bearer,
      body: JSON.stringify({ id: "1" }),
      contentType: "text/plain",
    });
    assert.equal(badType.status, 400);
    assert.equal(errorCode(badType.body).message, "Content-Type must be application/json.");

    const malformed = await callWrite("POST", fixture.api.slug, {
      authorization: fixture.bearer,
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal(errorCode(malformed.body).message, "The request body must be valid JSON.");

    const arrayBody = await callWrite("POST", fixture.api.slug, {
      authorization: fixture.bearer,
      body: "[]",
    });
    assert.equal(arrayBody.status, 400);
    assert.equal(
      errorCode(arrayBody.body).message,
      "The request body must be a JSON object, not an array.",
    );

    const empty = await callWrite("PATCH", fixture.api.slug, {
      authorization: fixture.bearer,
      query: "?rowNumber=2",
      body: "{}",
    });
    assert.equal(empty.status, 400);
    assert.equal(
      errorCode(empty.body).message,
      "The request body must include at least one field.",
    );

    const unknown = await callWrite("POST", fixture.api.slug, {
      authorization: fixture.bearer,
      body: JSON.stringify({ town: "paris" }),
    });
    assert.equal(unknown.status, 400);
    assert.equal(
      errorCode(unknown.body).message,
      "town is not a column in this worksheet.",
    );

    const missingRow = await callWrite("DELETE", fixture.api.slug, {
      authorization: fixture.bearer,
    });
    assert.equal(missingRow.status, 400);
    assert.equal(
      errorCode(missingRow.body).message,
      "rowNumber is required and must identify one data row.",
    );

    const headerRow = await callWrite("PUT", fixture.api.slug, {
      authorization: fixture.bearer,
      query: "?rowNumber=1",
      body: JSON.stringify({ id: "x" }),
    });
    assert.equal(headerRow.status, 400);
    assert.equal(
      errorCode(headerRow.body).message,
      "rowNumber 1 is the header row and cannot be changed.",
    );

    const outOfRange = await callWrite("DELETE", fixture.api.slug, {
      authorization: fixture.bearer,
      query: "?rowNumber=9",
    });
    assert.equal(outOfRange.status, 400);
    assert.equal(
      errorCode(outOfRange.body).message,
      "rowNumber 9 is outside this worksheet.",
    );
  });

  it("returns Google permission and availability failures safely", async () => {
    const fixture = await createFixture("google-errors");

    installGoogle({
      values: [
        ["id", "name"],
        ["1", "ada"],
      ],
      mutateStatus: 401,
    });
    const reauth = await callWrite("POST", fixture.api.slug, {
      authorization: fixture.bearer,
      body: JSON.stringify({ id: "9", name: "luna" }),
    });
    assert.equal(reauth.status, 503);
    assert.equal(errorCode(reauth.body).code, "GOOGLE_REAUTH_REQUIRED");
    assert.equal(reauth.text.includes("write-access-token"), false);

    installGoogle({
      values: [
        ["id", "name"],
        ["1", "ada"],
      ],
      failNetwork: true,
    });
    const offline = await callWrite("DELETE", fixture.api.slug, {
      authorization: fixture.bearer,
      query: "?rowNumber=2",
    });
    assert.equal(offline.status, 503);
    assert.equal(errorCode(offline.body).code, "GOOGLE_UNAVAILABLE");

    await prisma.googleConnection.delete({ where: { userId: fixture.user.id } });
    installGoogle({
      values: [
        ["id", "name"],
        ["1", "ada"],
      ],
    });
    const disconnected = await callWrite("PATCH", fixture.api.slug, {
      authorization: fixture.bearer,
      query: "?rowNumber=2",
      body: JSON.stringify({ name: "luna" }),
    });
    assert.equal(disconnected.status, 503);
    assert.equal(errorCode(disconnected.body).code, "GOOGLE_NOT_CONNECTED");
  });

  it("ignores spreadsheet overrides in the body and never writes MySQL rows", async () => {
    const fixture = await createFixture("override");
    const calls = installGoogle({
      values: [
        ["id", "name"],
        ["1", "ada"],
      ],
    });

    const response = await callWrite("POST", fixture.api.slug, {
      authorization: fixture.bearer,
      body: JSON.stringify({
        id: "9",
        name: "luna",
        spreadsheetId: "other-sheet",
        worksheetId: 99,
        userId: 1,
      }),
    });

    assert.equal(response.status, 400);
    assert.equal(
      errorCode(response.body).message,
      "spreadsheetId is not a column in this worksheet.",
    );
    assert.equal(
      calls.some((call) => call.path.includes(":append")),
      false,
    );
    assert.equal(
      calls.some((call) => call.path.includes("other-sheet")),
      false,
    );
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
