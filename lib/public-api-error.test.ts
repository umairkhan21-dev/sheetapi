import "dotenv/config";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GoogleNotConnectedError } from "./google-access";
import {
  GoogleSheetsError,
  WorksheetNotFoundError,
  WorksheetTooLargeError,
} from "./google-worksheets";
import { publicApiErrorResponse } from "./public-api-error";

async function readError(response: Response) {
  const body: unknown = await response.json();
  assert.equal(typeof body, "object");
  assert.equal(body !== null && !Array.isArray(body), true);
  const record = body as {
    success?: unknown;
    error?: { code?: unknown; message?: unknown };
  };
  assert.equal(record.success, false);
  assert.equal(JSON.stringify(body).includes("token"), false);
  return {
    status: response.status,
    code: record.error?.code,
    message: record.error?.message,
  };
}

describe("public API errors", () => {
  it("hides spreadsheet data when the worksheet is missing", async () => {
    const error = await readError(
      publicApiErrorResponse(new WorksheetNotFoundError()),
    );

    assert.equal(error.status, 404);
    assert.equal(error.code, "WORKSHEET_NOT_FOUND");
  });

  it("does not return a partial worksheet when the sheet is too large", async () => {
    const error = await readError(
      publicApiErrorResponse(new WorksheetTooLargeError()),
    );

    assert.equal(error.status, 413);
    assert.equal(error.code, "WORKSHEET_TOO_LARGE");
    assert.equal(Array.isArray(error), false);
  });

  it("uses a safe message when Google authorization fails", async () => {
    const error = await readError(
      publicApiErrorResponse(new GoogleSheetsError(401, "reauth")),
    );

    assert.equal(error.status, 503);
    assert.equal(error.code, "GOOGLE_REAUTH_REQUIRED");
    assert.equal(error.message, "This API is temporarily unavailable.");
  });

  it("uses a safe message when the owner has no Google connection", async () => {
    const error = await readError(
      publicApiErrorResponse(new GoogleNotConnectedError()),
    );

    assert.equal(error.status, 503);
    assert.equal(error.code, "GOOGLE_NOT_CONNECTED");
    assert.match(String(error.message), /Reconnect Google Sheets/);
  });
});
