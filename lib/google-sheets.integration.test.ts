import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, afterEach, describe, it } from "node:test";
import bcrypt from "bcrypt";
import { createAuthToken } from "./auth";
import { withGoogleAccessToken } from "./google-access";
import { getGooglePickerConfig, GooglePickerConfigError } from "./google-picker";
import {
  getGoogleSpreadsheet,
  GoogleDriveError,
  listGoogleSpreadsheets,
  SpreadsheetTypeError,
} from "./google-sheets";
import { worksheetErrorResponse } from "./google-worksheet-response";
import {
  GoogleSheetsError,
  readSpreadsheetWorksheets,
  readWorksheetPreview,
  readWorksheetRecords,
  WorksheetNotFoundError,
} from "./google-worksheets";
import { prisma } from "./prisma";

const originalFetch = globalThis.fetch;
const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Sheets-${stamp}-pass`;
const baseUrl = "http://127.0.0.1:3000";
const createdEmails: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function assertNoCredential(text: string, secrets: Array<string | null | undefined>) {
  for (const secret of secrets) {
    if (secret && text.includes(secret)) {
      throw new Error("A response included a credential.");
    }
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function spreadsheetDocument(
  spreadsheetId: string,
  sheets: Array<{ sheetId: number; title: string; index: number }> = [
    { sheetId: 0, title: "Sheet1", index: 0 },
  ],
) {
  return {
    spreadsheetId,
    properties: { title: "Products" },
    sheets: sheets.map((sheet) => ({ properties: sheet })),
  };
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
  return { code: record.error?.code, message: record.error?.message };
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
  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    body: parsed,
    text,
    cache: response.headers.get("cache-control"),
    type: response.headers.get("content-type"),
  };
}

async function createUser(label: string) {
  const email = `sheets-${stamp}-${label}@example.com`;
  createdEmails.push(email);
  const user = await prisma.user.create({
    data: {
      name: `Sheets ${label}`,
      email,
      password: await bcrypt.hash(password, 4),
    },
  });

  return { user, email };
}

describe("Google spreadsheet discovery", { concurrency: 1 }, () => {
  it("lists spreadsheets, skips unrelated files, and reports Drive failures", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      assert.equal(url.includes("drive-access-token"), false);
      const header = new Headers(init?.headers).get("authorization");
      assert.equal(header, "Bearer drive-access-token");

      if (url.includes("pageToken=next-page")) {
        return jsonResponse({
          files: [
            {
              id: "sheet-2",
              name: "Customers",
              mimeType: "application/vnd.google-apps.spreadsheet",
              modifiedTime: "2026-10-01T00:00:00.000Z",
            },
            {
              id: "sheet-1",
              name: "Duplicate",
              mimeType: "application/vnd.google-apps.spreadsheet",
              modifiedTime: "2026-10-02T00:00:00.000Z",
            },
          ],
        });
      }

      return jsonResponse({
        nextPageToken: "next-page",
        files: [
          {
            id: "sheet-1",
            name: " Products ",
            mimeType: "application/vnd.google-apps.spreadsheet",
            modifiedTime: "2026-10-02T00:00:00.000Z",
          },
          {
            id: "doc-1",
            name: "Notes",
            mimeType: "application/vnd.google-apps.document",
          },
          {
            id: "trashed-sheet",
            name: "Old",
            mimeType: "application/vnd.google-apps.spreadsheet",
            trashed: true,
          },
        ],
      });
    };

    const spreadsheets = await listGoogleSpreadsheets("drive-access-token");
    assert.deepEqual(spreadsheets, [
      {
        id: "sheet-1",
        name: "Products",
        modifiedTime: "2026-10-02T00:00:00.000Z",
      },
      {
        id: "sheet-2",
        name: "Customers",
        modifiedTime: "2026-10-01T00:00:00.000Z",
      },
    ]);
    assert.equal(calls.every((call) => call.startsWith("GET ")), true);

    globalThis.fetch = async () => jsonResponse({ files: [] });
    assert.deepEqual(await listGoogleSpreadsheets("drive-access-token"), []);

    globalThis.fetch = async () => jsonResponse({ files: "nope" });
    await assert.rejects(
      () => listGoogleSpreadsheets("drive-access-token"),
      (error: unknown) => error instanceof GoogleDriveError && error.httpStatus === 0,
    );

    globalThis.fetch = async () =>
      jsonResponse({ error: { errors: [{ reason: "authError" }] } }, 401);
    await assert.rejects(
      () => listGoogleSpreadsheets("drive-access-token"),
      (error: unknown) =>
        error instanceof GoogleDriveError &&
        error.httpStatus === 401 &&
        error.reauthRequired,
    );

    globalThis.fetch = async () =>
      jsonResponse(
        { error: { errors: [{ reason: "rateLimitExceeded" }] } },
        403,
      );
    await assert.rejects(
      () => listGoogleSpreadsheets("drive-access-token"),
      (error: unknown) =>
        error instanceof GoogleDriveError &&
        error.httpStatus === 403 &&
        error.reauthRequired === false,
    );

    globalThis.fetch = async () => new Response("down", { status: 500 });
    await assert.rejects(
      () => listGoogleSpreadsheets("drive-access-token"),
      (error: unknown) =>
        error instanceof GoogleDriveError &&
        error.httpStatus === 500 &&
        error.reauthRequired === false,
    );

    globalThis.fetch = async () => {
      throw new TypeError("network down");
    };
    await assert.rejects(
      () => listGoogleSpreadsheets("drive-access-token"),
      (error: unknown) => error instanceof GoogleDriveError && error.httpStatus === 0,
    );

    globalThis.fetch = originalFetch;
  });

  it("accepts only a spreadsheet the token can read", async () => {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      assert.equal(init?.method ?? "GET", "GET");
      assert.equal(url.includes("/sheet-1"), true);
      return jsonResponse({
        id: "sheet-1",
        name: "Products",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-10-02T00:00:00.000Z",
      });
    };

    assert.deepEqual(await getGoogleSpreadsheet("drive-access-token", "sheet-1"), {
      id: "sheet-1",
      name: "Products",
      modifiedTime: "2026-10-02T00:00:00.000Z",
    });

    globalThis.fetch = async () =>
      jsonResponse({
        id: "doc-1",
        name: "Notes",
        mimeType: "application/vnd.google-apps.document",
      });
    await assert.rejects(
      () => getGoogleSpreadsheet("drive-access-token", "doc-1"),
      SpreadsheetTypeError,
    );

    globalThis.fetch = async () => new Response("missing", { status: 404 });
    await assert.rejects(
      () => getGoogleSpreadsheet("drive-access-token", "missing"),
      (error: unknown) =>
        error instanceof GoogleDriveError &&
        error.httpStatus === 404 &&
        error.reauthRequired === false,
    );

    globalThis.fetch = async () => new Response("not-json", { status: 200 });
    await assert.rejects(
      () => getGoogleSpreadsheet("drive-access-token", "sheet-1"),
      (error: unknown) => error instanceof GoogleDriveError && error.httpStatus === 0,
    );

    globalThis.fetch = originalFetch;
  });

  it("reads worksheet tabs and preview rows, including empty and broken responses", async () => {
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);

      if (url.includes("/values/")) {
        return jsonResponse({
          values: [
            ["id", "name", "name"],
            ["1", "Pen", "Blue"],
            [2, true, ""],
          ],
        });
      }

      return jsonResponse(
        spreadsheetDocument("sheet-1", [
          { sheetId: 4, title: "Orders", index: 1 },
          { sheetId: 0, title: "Sheet1", index: 0 },
        ]),
      );
    };

    const listed = await readSpreadsheetWorksheets("sheets-access-token", "sheet-1");
    assert.deepEqual(listed.sheets, [
      { id: 0, title: "Sheet1" },
      { id: 4, title: "Orders" },
    ]);

    urls.length = 0;
    const preview = await readWorksheetPreview("sheets-access-token", "sheet-1", 4);
    assert.equal(preview.worksheet.title, "Orders");
    assert.deepEqual(preview.columns, ["id", "name", "name 2"]);
    assert.deepEqual(preview.rows, [
      { id: "1", name: "Pen", "name 2": "Blue" },
      { id: "2", name: "TRUE", "name 2": "" },
    ]);
    assert.equal(preview.truncated, false);
    assert.equal(urls.some((url) => url.includes("/values/")), true);
    assert.equal(urls.some((url) => url.includes("Sheet1")), false);

    globalThis.fetch = async (input) => {
      if (String(input).includes("/values/")) {
        return jsonResponse({});
      }

      return jsonResponse(spreadsheetDocument("sheet-1"));
    };
    const empty = await readWorksheetPreview("sheets-access-token", "sheet-1", 0);
    assert.deepEqual(empty.rows, []);
    assert.deepEqual(empty.columns, []);
    assert.equal(empty.truncated, false);

    let valueReads = 0;
    globalThis.fetch = async (input) => {
      if (String(input).includes("/values/")) {
        valueReads += 1;
      }

      return jsonResponse(spreadsheetDocument("sheet-1"));
    };
    await assert.rejects(
      () => readWorksheetPreview("sheets-access-token", "sheet-1", 9),
      WorksheetNotFoundError,
    );
    assert.equal(valueReads, 0);

    globalThis.fetch = async (input) => {
      if (String(input).includes("/values/")) {
        return jsonResponse({
          values: [
            ["id"],
            ...Array.from({ length: 101 }, (_, index) => [String(index + 1)]),
          ],
        });
      }

      return jsonResponse(spreadsheetDocument("sheet-1"));
    };
    const truncated = await readWorksheetPreview("sheets-access-token", "sheet-1", 0);
    assert.equal(truncated.rows.length, 100);
    assert.equal(truncated.truncated, true);

    globalThis.fetch = async () =>
      jsonResponse({
        spreadsheetId: "different-sheet",
        properties: { title: "Products" },
        sheets: [],
      });
    await assert.rejects(
      () => readSpreadsheetWorksheets("sheets-access-token", "sheet-1"),
      (error: unknown) =>
        error instanceof GoogleSheetsError && error.kind === "unavailable",
    );

    globalThis.fetch = async (input) => {
      if (String(input).includes("/values/")) {
        return jsonResponse({ values: { id: "1" } });
      }

      return jsonResponse(spreadsheetDocument("sheet-1"));
    };
    await assert.rejects(
      () => readWorksheetRecords("sheets-access-token", "sheet-1", 0),
      (error: unknown) =>
        error instanceof GoogleSheetsError && error.kind === "unavailable",
    );

    globalThis.fetch = async () => new Response("missing", { status: 404 });
    await assert.rejects(
      () => readSpreadsheetWorksheets("sheets-access-token", "sheet-1"),
      (error: unknown) =>
        error instanceof GoogleSheetsError && error.kind === "not_found",
    );

    globalThis.fetch = async () =>
      jsonResponse({ error: { errors: [{ reason: "accessNotConfigured" }] } }, 403);
    await assert.rejects(
      () => readSpreadsheetWorksheets("sheets-access-token", "sheet-1"),
      (error: unknown) =>
        error instanceof GoogleSheetsError && error.kind === "not_configured",
    );

    globalThis.fetch = async () => new Response("down", { status: 500 });
    await assert.rejects(
      () => readWorksheetPreview("sheets-access-token", "sheet-1", 0),
      (error: unknown) =>
        error instanceof GoogleSheetsError &&
        error.httpStatus === 500 &&
        error.kind === "unavailable",
    );

    globalThis.fetch = async () => {
      throw new TypeError("network down");
    };
    await assert.rejects(
      () => readSpreadsheetWorksheets("sheets-access-token", "sheet-1"),
      (error: unknown) =>
        error instanceof GoogleSheetsError && error.httpStatus === 0,
    );

    globalThis.fetch = originalFetch;
  });

  it("hides credentials in worksheet and picker failures", async () => {
    const refreshFailure = await worksheetErrorResponse(
      new GoogleSheetsError(401, "reauth"),
    );
    const refreshBody = await refreshFailure.text();
    assert.equal(refreshFailure.status, 403);
    assert.equal(errorCode(JSON.parse(refreshBody)).code, "GOOGLE_REAUTH_REQUIRED");
    assert.equal(refreshBody.includes("ya29.secret-token"), false);
    assert.equal(refreshBody.toLowerCase().includes("stack"), false);

    const internal = await worksheetErrorResponse(new Error("ya29.secret-token"));
    const internalBody = await internal.text();
    assert.equal(internal.status, 500);
    assert.equal(errorCode(JSON.parse(internalBody)).code, "INTERNAL_ERROR");
    assert.equal(internalBody.includes("ya29.secret-token"), false);

    const config = getGooglePickerConfig();
    assert.equal(/^AIza[0-9A-Za-z_-]{20,180}$/.test(config.developerKey), true);
    assert.equal(/^\d{6,20}$/.test(config.appId), true);
    assertNoCredential(
      `${config.developerKey} ${config.appId}`,
      [process.env.GOOGLE_CLIENT_SECRET],
    );

    const previousKey = process.env.GOOGLE_PICKER_API_KEY;
    const previousAppId = process.env.GOOGLE_APP_ID;

    try {
      process.env.GOOGLE_PICKER_API_KEY = "not-a-picker-key";
      assert.throws(getGooglePickerConfig, GooglePickerConfigError);
      process.env.GOOGLE_PICKER_API_KEY = previousKey;
      process.env.GOOGLE_APP_ID = "not-a-project-number";
      assert.throws(getGooglePickerConfig, GooglePickerConfigError);
    } finally {
      if (previousKey == null) {
        delete process.env.GOOGLE_PICKER_API_KEY;
      } else {
        process.env.GOOGLE_PICKER_API_KEY = previousKey;
      }

      if (previousAppId == null) {
        delete process.env.GOOGLE_APP_ID;
      } else {
        process.env.GOOGLE_APP_ID = previousAppId;
      }
    }
  });
});

describe("Google sheet routes", { concurrency: 1 }, () => {
  it("rejects signed-out, invalid, and unowned spreadsheet requests", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const ownerSheet = `owner-sheet-${stamp}`;
    await prisma.selectedSpreadsheet.create({
      data: {
        userId: owner.user.id,
        spreadsheetId: ownerSheet,
        name: "Owner sheet",
      },
    });
    await prisma.selectedSpreadsheet.create({
      data: {
        userId: other.user.id,
        spreadsheetId: `other-sheet-${stamp}`,
        name: "Other sheet",
      },
    });

    try {
      const ownerCookie = await login(owner.email);
      const otherCookie = await login(other.email);
      const signedOutPaths = [
        "/api/google/sheets",
        "/api/google/picker",
        "/api/google/sheets/selection",
        `/api/google/sheets/${ownerSheet}`,
        `/api/google/sheets/${ownerSheet}/preview?sheetId=0`,
      ];

      for (const path of signedOutPaths) {
        const signedOut = await send(null, "GET", path);
        assert.equal(signedOut.status, 401);
        assert.equal(errorCode(signedOut.body).code, "UNAUTHORIZED");
      }

      const signedOutSelection = await send(
        null,
        "POST",
        "/api/google/sheets/selection",
        JSON.stringify({ spreadsheetId: ownerSheet }),
      );
      assert.equal(signedOutSelection.status, 401);

      const ownList = await send(ownerCookie, "GET", "/api/google/sheets/selection");
      const otherList = await send(otherCookie, "GET", "/api/google/sheets/selection");
      assert.equal(ownList.status, 200);
      assert.equal(ownList.text.includes(ownerSheet), true);
      assert.equal(ownList.text.includes(`other-sheet-${stamp}`), false);
      assert.equal(otherList.text.includes(ownerSheet), false);
      assert.equal(otherList.text.toLowerCase().includes("token"), false);

      const unownedSheet = await send(
        otherCookie,
        "GET",
        `/api/google/sheets/${ownerSheet}`,
      );
      assert.equal(unownedSheet.status, 404);
      assert.equal(errorCode(unownedSheet.body).code, "SPREADSHEET_NOT_FOUND");

      const unownedPreview = await send(
        otherCookie,
        "GET",
        `/api/google/sheets/${ownerSheet}/preview?sheetId=0`,
      );
      assert.equal(unownedPreview.status, 404);
      assert.equal(errorCode(unownedPreview.body).code, "SPREADSHEET_NOT_FOUND");

      const notConnected = await send(
        ownerCookie,
        "GET",
        `/api/google/sheets/${ownerSheet}`,
      );
      assert.equal(notConnected.status, 404);
      assert.equal(errorCode(notConnected.body).code, "GOOGLE_NOT_CONNECTED");

      const missingList = await send(ownerCookie, "GET", "/api/google/sheets");
      assert.equal(missingList.status, 404);
      assert.equal(errorCode(missingList.body).code, "GOOGLE_NOT_CONNECTED");

      const missingPicker = await send(ownerCookie, "GET", "/api/google/picker");
      assert.equal(missingPicker.status, 404);
      assert.equal(errorCode(missingPicker.body).code, "GOOGLE_NOT_CONNECTED");

      const invalidPreview = await send(
        ownerCookie,
        "GET",
        `/api/google/sheets/${ownerSheet}/preview`,
      );
      assert.equal(invalidPreview.status, 400);
      assert.equal(errorCode(invalidPreview.body).code, "INVALID_INPUT");

      const invalidId = await send(ownerCookie, "GET", "/api/google/sheets/bad%20id");
      assert.equal(invalidId.status, 400);
      assert.equal(errorCode(invalidId.body).code, "INVALID_INPUT");

      for (const body of ["", "{", JSON.stringify({ spreadsheetId: "bad id" })]) {
        const invalidSelection = await send(
          ownerCookie,
          "POST",
          "/api/google/sheets/selection",
          body,
        );
        assert.equal(invalidSelection.status, 400);
        assert.equal(errorCode(invalidSelection.body).code, "INVALID_INPUT");
      }

      const disconnectedSelection = await send(
        ownerCookie,
        "POST",
        "/api/google/sheets/selection",
        JSON.stringify({ spreadsheetId: ownerSheet }),
      );
      assert.equal(disconnectedSelection.status, 404);
      assert.equal(errorCode(disconnectedSelection.body).code, "GOOGLE_NOT_CONNECTED");
      assert.equal(
        await prisma.selectedSpreadsheet.count({ where: { userId: owner.user.id } }),
        1,
      );
    } finally {
      await prisma.user.deleteMany({
        where: { email: { in: [owner.email, other.email] } },
      });
    }
  });

  it("does not save a spreadsheet Google rejects, and hides refresh failures", async () => {
    const owner = await createUser("connected");
    const spreadsheetId = `rejected-sheet-${stamp}`;
    await prisma.selectedSpreadsheet.create({
      data: {
        userId: owner.user.id,
        spreadsheetId,
        name: "Rejected",
      },
    });
    await prisma.googleConnection.create({
      data: {
        userId: owner.user.id,
        googleAccountId: `google-${owner.user.id}`,
        accessToken: "picker-access-token",
        refreshToken: "picker-refresh-token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    try {
      const cookie = await login(owner.email);
      const picker = await send(cookie, "GET", "/api/google/picker");
      assert.equal(picker.status, 200);
      assert.equal(picker.cache, "no-store");
      const pickerBody = picker.body as {
        success?: unknown;
        picker?: { accessToken?: unknown; developerKey?: unknown; appId?: unknown };
      };
      assert.equal(pickerBody.success, true);
      assert.equal(pickerBody.picker?.accessToken, "picker-access-token");
      assert.equal(/^AIza/.test(String(pickerBody.picker?.developerKey)), true);
      assert.equal(/^\d+$/.test(String(pickerBody.picker?.appId)), true);
      assertNoCredential(picker.text, [
        "picker-refresh-token",
        process.env.GOOGLE_CLIENT_SECRET,
      ]);

      const rejected = await send(
        cookie,
        "POST",
        "/api/google/sheets/selection",
        JSON.stringify({ spreadsheetId: `missing-${stamp}` }),
      );
      assert.equal(rejected.status, 403);
      assert.equal(errorCode(rejected.body).code, "GOOGLE_REAUTH_REQUIRED");
      assertNoCredential(rejected.text, [
        "picker-access-token",
        "picker-refresh-token",
        process.env.GOOGLE_CLIENT_SECRET,
      ]);
      assert.equal(
        await prisma.selectedSpreadsheet.count({
          where: { userId: owner.user.id, spreadsheetId: `missing-${stamp}` },
        }),
        0,
      );

      const sheet = await send(cookie, "GET", `/api/google/sheets/${spreadsheetId}`);
      assert.equal(sheet.status, 403);
      assert.equal(errorCode(sheet.body).code, "GOOGLE_REAUTH_REQUIRED");
      assertNoCredential(sheet.text, ["picker-access-token", "picker-refresh-token"]);

      await prisma.googleConnection.update({
        where: { userId: owner.user.id },
        data: {
          accessToken: "expired-access-token",
          refreshToken: "fake-refresh-for-list",
          expiresAt: new Date(Date.now() - 60_000),
        },
      });
      const listed = await send(cookie, "GET", "/api/google/sheets");
      assert.equal(listed.status, 403);
      assert.equal(errorCode(listed.body).code, "GOOGLE_REAUTH_REQUIRED");
      assertNoCredential(listed.text, [
        "expired-access-token",
        "fake-refresh-for-list",
        process.env.GOOGLE_CLIENT_SECRET,
      ]);
      const stored = await prisma.googleConnection.findUnique({
        where: { userId: owner.user.id },
      });
      assert.equal(stored?.refreshToken, "fake-refresh-for-list");
      assert.equal(stored?.accessToken, "expired-access-token");

      const pickerRefresh = await send(cookie, "GET", "/api/google/picker");
      assert.equal(pickerRefresh.status, 403);
      assert.equal(errorCode(pickerRefresh.body).code, "GOOGLE_REAUTH_REQUIRED");
      assertNoCredential(pickerRefresh.text, ["fake-refresh-for-list"]);
    } finally {
      await prisma.user.deleteMany({ where: { email: owner.email } });
    }
  });

  it("lists and previews the connected account without changing the spreadsheet", async (t) => {
    const connection = await prisma.googleConnection.findFirst({
      select: {
        userId: true,
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
        updatedAt: true,
      },
    });

    if (!connection?.refreshToken) {
      t.skip("blocked: no connected Google account with a refresh token");
      return;
    }

    const before = {
      refreshHash: digest(connection.refreshToken),
      accessHash: digest(connection.accessToken),
      updatedAt: connection.updatedAt.getTime(),
    };
    const savedBefore = await prisma.selectedSpreadsheet.findMany({
      where: { userId: connection.userId },
      select: { id: true, spreadsheetId: true, name: true },
      orderBy: { id: "asc" },
    });
    const apisBefore = await prisma.api.findMany({
      where: { userId: connection.userId },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const cookie = `auth_token=${createAuthToken(connection.userId)}`;
    const secrets = [
      connection.accessToken,
      connection.refreshToken,
      process.env.GOOGLE_CLIENT_SECRET,
    ];

    const listed = await send(cookie, "GET", "/api/google/sheets");
    assert.equal(listed.status, 200);
    assert.equal(listed.cache, "no-store");
    assertNoCredential(listed.text, secrets);
    const listedBody = listed.body as {
      success?: unknown;
      spreadsheets?: Array<{ id?: unknown; name?: unknown; modifiedTime?: unknown }>;
    };
    assert.equal(listedBody.success, true);
    assert.equal(Array.isArray(listedBody.spreadsheets), true);
    const httpSpreadsheets = listedBody.spreadsheets ?? [];

    for (const spreadsheet of httpSpreadsheets) {
      assert.equal(typeof spreadsheet.id, "string");
      assert.equal(typeof spreadsheet.name, "string");
      assert.equal(
        spreadsheet.modifiedTime == null || typeof spreadsheet.modifiedTime === "string",
        true,
      );
    }

    const directSpreadsheets = await withGoogleAccessToken(
      connection.userId,
      (accessToken) => listGoogleSpreadsheets(accessToken),
    );
    assert.equal(
      digest(JSON.stringify(httpSpreadsheets)),
      digest(JSON.stringify(directSpreadsheets)),
    );
    t.diagnostic(`live spreadsheet list count: ${httpSpreadsheets.length}`);

    const selection = await send(cookie, "GET", "/api/google/sheets/selection");
    assert.equal(selection.status, 200);
    assertNoCredential(selection.text, secrets);
    const selectionBody = selection.body as {
      spreadsheets?: Array<{ id?: unknown }>;
    };
    const selectionIds = (selectionBody.spreadsheets ?? []).map((item) =>
      String(item.id),
    );
    assert.equal(
      digest(selectionIds.slice().sort().join("\n")),
      digest(savedBefore.map((item) => item.spreadsheetId).sort().join("\n")),
    );

    const picker = await send(cookie, "GET", "/api/google/picker");
    assert.equal(picker.status, 200);
    assertNoCredential(picker.text, [
      connection.refreshToken,
      process.env.GOOGLE_CLIENT_SECRET,
    ]);
    const pickerBody = picker.body as {
      picker?: { accessToken?: unknown; developerKey?: unknown; appId?: unknown };
    };
    assert.equal(typeof pickerBody.picker?.accessToken, "string");
    assert.equal(
      digest(String(pickerBody.picker?.accessToken)),
      digest(connection.accessToken),
    );
    assert.equal(/^AIza/.test(String(pickerBody.picker?.developerKey)), true);
    assert.equal(/^\d+$/.test(String(pickerBody.picker?.appId)), true);

    const missingId = `missing-${stamp}`;
    const rejected = await send(
      cookie,
      "POST",
      "/api/google/sheets/selection",
      JSON.stringify({ spreadsheetId: missingId }),
    );
    assert.equal(rejected.status, 404);
    assert.equal(errorCode(rejected.body).code, "SPREADSHEET_NOT_FOUND");
    assertNoCredential(rejected.text, secrets);
    const savedAfterReject = await prisma.selectedSpreadsheet.findMany({
      where: { userId: connection.userId },
      select: { id: true, spreadsheetId: true, name: true },
      orderBy: { id: "asc" },
    });
    assert.deepEqual(savedAfterReject, savedBefore);

    let readable: {
      spreadsheetId: string;
      worksheetId: number;
      worksheetTitle: string;
      recordHash: string;
    } | null = null;

    for (const saved of savedBefore) {
      try {
        const spreadsheet = await withGoogleAccessToken(
          connection.userId,
          (accessToken) =>
            readSpreadsheetWorksheets(accessToken, saved.spreadsheetId),
        );
        const worksheet = spreadsheet.sheets[0];

        if (!worksheet) {
          continue;
        }

        const records = await withGoogleAccessToken(
          connection.userId,
          (accessToken) =>
            readWorksheetRecords(
              accessToken,
              saved.spreadsheetId,
              worksheet.id,
            ),
        );
        readable = {
          spreadsheetId: saved.spreadsheetId,
          worksheetId: worksheet.id,
          worksheetTitle: worksheet.title,
          recordHash: digest(JSON.stringify(records.rows)),
        };
        break;
      } catch {
        continue;
      }
    }

    if (!readable) {
      t.diagnostic("live worksheet preview and API creation skipped: no readable saved spreadsheet");
    } else {
      const opened = await send(
        cookie,
        "GET",
        `/api/google/sheets/${encodeURIComponent(readable.spreadsheetId)}`,
      );
      assert.equal(opened.status, 200);
      assertNoCredential(opened.text, secrets);
      const openedBody = opened.body as {
        sheets?: Array<{ id?: unknown; title?: unknown }>;
      };
      assert.equal(
        openedBody.sheets?.some(
          (sheet) =>
            sheet.id === readable?.worksheetId &&
            sheet.title === readable.worksheetTitle,
        ),
        true,
      );

      const preview = await send(
        cookie,
        "GET",
        `/api/google/sheets/${encodeURIComponent(readable.spreadsheetId)}/preview?sheetId=${readable.worksheetId}`,
      );
      assert.equal(preview.status, 200);
      assert.equal(preview.cache, "no-store");
      assertNoCredential(preview.text, secrets);
      const directPreview = await withGoogleAccessToken(
        connection.userId,
        (accessToken) =>
          readWorksheetPreview(
            accessToken,
            readable.spreadsheetId,
            readable.worksheetId,
          ),
      );
      const previewBody = preview.body as {
        rows?: unknown;
        columns?: unknown;
        truncated?: unknown;
        worksheet?: { title?: unknown };
      };
      assert.equal(previewBody.worksheet?.title, readable.worksheetTitle);
      assert.equal(
        digest(
          JSON.stringify({
            columns: previewBody.columns,
            rows: previewBody.rows,
            truncated: previewBody.truncated,
          }),
        ),
        digest(
          JSON.stringify({
            columns: directPreview.columns,
            rows: directPreview.rows,
            truncated: directPreview.truncated,
          }),
        ),
      );

      const unknownSheet = await send(
        cookie,
        "GET",
        `/api/google/sheets/${encodeURIComponent(readable.spreadsheetId)}/preview?sheetId=2147483646`,
      );
      assert.equal(unknownSheet.status, 404);
      assert.equal(errorCode(unknownSheet.body).code, "WORKSHEET_NOT_FOUND");
      assertNoCredential(unknownSheet.text, secrets);

      let emptyWorksheetId: number | null = null;
      const tabs = await withGoogleAccessToken(connection.userId, (accessToken) =>
        readSpreadsheetWorksheets(accessToken, readable.spreadsheetId),
      );

      for (const sheet of tabs.sheets) {
        const records = await withGoogleAccessToken(
          connection.userId,
          (accessToken) =>
            readWorksheetRecords(accessToken, readable.spreadsheetId, sheet.id),
        );

        if (records.rows.length === 0) {
          emptyWorksheetId = sheet.id;
          break;
        }
      }

      if (emptyWorksheetId == null) {
        t.diagnostic("live empty worksheet: not present on the readable spreadsheet");
      } else {
        const emptyPreview = await send(
          cookie,
          "GET",
          `/api/google/sheets/${encodeURIComponent(readable.spreadsheetId)}/preview?sheetId=${emptyWorksheetId}`,
        );
        assert.equal(emptyPreview.status, 200);
        const emptyBody = emptyPreview.body as { rows?: unknown };
        assert.deepEqual(emptyBody.rows, []);
        t.diagnostic("live empty worksheet preview returned no rows");
      }

      const slug = `gverify${stamp.replace(/[^a-z0-9]/g, "")}`;
      const missingWorksheet = await send(
        cookie,
        "POST",
        "/api/apis",
        JSON.stringify({
          name: "Missing worksheet",
          slug: `${slug}x`,
          spreadsheetId: readable.spreadsheetId,
          worksheetId: 2147483646,
        }),
      );
      assert.equal(missingWorksheet.status, 404);
      assert.equal(errorCode(missingWorksheet.body).code, "WORKSHEET_NOT_FOUND");
      assert.equal(
        await prisma.api.findUnique({ where: { slug: `${slug}x` } }),
        null,
      );

      let apiId: number | null = null;

      try {
        const created = await send(
          cookie,
          "POST",
          "/api/apis",
          JSON.stringify({
            name: "Verification API",
            slug,
            spreadsheetId: readable.spreadsheetId,
            worksheetId: readable.worksheetId,
          }),
        );
        assert.equal(created.status, 201);
        assertNoCredential(created.text, secrets);
        const createdBody = created.body as {
          success?: unknown;
          api?: {
            id?: unknown;
            worksheetName?: unknown;
            spreadsheetId?: unknown;
            status?: unknown;
            slug?: unknown;
          };
        };
        if (typeof createdBody.api?.id === "number") {
          apiId = createdBody.api.id;
        }
        assert.equal(createdBody.success, true);
        assert.equal(createdBody.api?.slug, slug);
        assert.equal(createdBody.api?.spreadsheetId, readable.spreadsheetId);
        assert.equal(createdBody.api?.worksheetName, readable.worksheetTitle);
        assert.equal(createdBody.api?.status, "ACTIVE");
        assert.equal(typeof apiId, "number");

        if (apiId == null) {
          return;
        }

        const storedApi = await prisma.api.findUnique({
          where: { id: apiId },
        });
        assert.equal(storedApi?.worksheetName, readable.worksheetTitle);
        assert.equal(storedApi?.worksheetId, readable.worksheetId);
        assert.equal(storedApi?.userId, connection.userId);

        const key = await send(
          cookie,
          "POST",
          `/api/apis/${apiId}/keys`,
          JSON.stringify({ name: "Verification" }),
        );
        assert.equal(key.status, 201);
        const keyBody = key.body as { key?: { secret?: unknown } };
        const secret = keyBody.key?.secret;
        assert.equal(typeof secret, "string");
        assertNoCredential(key.text, secrets);

        const served = await fetch(`${baseUrl}/api/v1/${slug}`, {
          headers: { authorization: `Bearer ${secret}` },
          cache: "no-store",
        });
        const servedText = await served.text();
        assert.equal(served.status, 200);
        assert.match(served.headers.get("content-type") ?? "", /application\/json/);
        assert.equal(served.headers.get("cache-control"), "no-store");
        assertNoCredential(servedText, [...secrets, String(secret)]);
        assert.equal(digest(JSON.stringify(JSON.parse(servedText))), readable.recordHash);

        const during = await withGoogleAccessToken(
          connection.userId,
          (accessToken) =>
            readWorksheetRecords(
              accessToken,
              readable.spreadsheetId,
              readable.worksheetId,
            ),
        );
        assert.equal(digest(JSON.stringify(during.rows)), readable.recordHash);
      } finally {
        if (typeof apiId === "number") {
          await send(cookie, "DELETE", `/api/apis/${apiId}`);
        }
      }

      const gone = await fetch(`${baseUrl}/api/v1/${slug}`, {
        cache: "no-store",
      });
      assert.equal(gone.status, 404);
      const afterRecords = await withGoogleAccessToken(
        connection.userId,
        (accessToken) =>
          readWorksheetRecords(
            accessToken,
            readable.spreadsheetId,
            readable.worksheetId,
          ),
      );
      assert.equal(digest(JSON.stringify(afterRecords.rows)), readable.recordHash);
    }

    const savedAfter = await prisma.selectedSpreadsheet.findMany({
      where: { userId: connection.userId },
      select: { id: true, spreadsheetId: true, name: true },
      orderBy: { id: "asc" },
    });
    const apisAfter = await prisma.api.findMany({
      where: { userId: connection.userId },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const storedConnection = await prisma.googleConnection.findUnique({
      where: { userId: connection.userId },
      select: { accessToken: true, refreshToken: true, updatedAt: true },
    });
    assert.deepEqual(savedAfter, savedBefore);
    assert.deepEqual(apisAfter, apisBefore);
    assert.equal(digest(storedConnection?.refreshToken ?? ""), before.refreshHash);
    assert.equal(digest(storedConnection?.accessToken ?? ""), before.accessHash);
    assert.equal(storedConnection?.updatedAt.getTime(), before.updatedAt);
  });
});

after(async () => {
  globalThis.fetch = originalFetch;

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
