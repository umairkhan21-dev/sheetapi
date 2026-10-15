import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  API_COLUMN_LIMIT,
  API_DATA_ROW_LIMIT,
  readWorksheetRecords,
  WorksheetNotFoundError,
  WorksheetTooLargeError,
  worksheetValuesToRecords,
} from "./google-worksheets";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("worksheet JSON records", () => {
  it("maps the header row to string fields", () => {
    const records = worksheetValuesToRecords([
      ["id", "name", "price"],
      ["1", "Pen", "20"],
      ["2", "Book", "100"],
    ]);

    assert.deepEqual(records.rows, [
      { id: "1", name: "Pen", price: "20" },
      { id: "2", name: "Book", price: "100" },
    ]);
  });

  it("returns no rows for an empty or header-only worksheet", () => {
    assert.deepEqual(worksheetValuesToRecords([]).rows, []);
    assert.deepEqual(
      worksheetValuesToRecords([["id", "name"]]).rows,
      [],
    );
  });

  it("keeps duplicate headers distinct and preserves cells longer than the preview cap", () => {
    const longValue = "x".repeat(2001);
    const records = worksheetValuesToRecords([
      ["name", "name"],
      [longValue, "Pen"],
    ]);

    assert.deepEqual(records.columns, ["name", "name 2"]);
    assert.equal(records.rows[0]?.name, longValue);
    assert.equal(records.rows[0]?.["name 2"], "Pen");
  });

  it("does not apply the 100-row preview limit", () => {
    const values = [
      ["id"],
      ...Array.from({ length: 150 }, (_, index) => [String(index + 1)]),
    ];
    const records = worksheetValuesToRecords(values);

    assert.equal(records.rows.length, 150);
    assert.equal(records.rows[149]?.id, "150");
  });

  it("rejects worksheets above the public read ceiling", () => {
    assert.throws(
      () =>
        worksheetValuesToRecords([
          Array.from({ length: API_COLUMN_LIMIT + 1 }, () => "column"),
        ]),
      WorksheetTooLargeError,
    );
    assert.throws(
      () =>
        worksheetValuesToRecords(
          Array.from({ length: API_DATA_ROW_LIMIT + 2 }, () => ["value"]),
        ),
      WorksheetTooLargeError,
    );
  });
});

describe("readWorksheetRecords", () => {
  it("reads the current worksheet without asking for another sheet", async () => {
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);

      if (url.includes("/values/")) {
        return Response.json({
          values: [
            ["id", "name"],
            ["1", "Pen"],
          ],
        });
      }

      return Response.json({
        spreadsheetId: "spreadsheet-1",
        properties: { title: "Products" },
        sheets: [
          {
            properties: { sheetId: 0, title: "Sheet1", index: 0 },
          },
          {
            properties: { sheetId: 2, title: "Other", index: 1 },
          },
        ],
      });
    };

    const records = await readWorksheetRecords("token", "spreadsheet-1", 2);

    assert.equal(records.worksheet.title, "Other");
    assert.deepEqual(records.rows, [{ id: "1", name: "Pen" }]);
    assert.equal(urls.length, 2);
    assert.match(urls[1] ?? "", /Other/);
    assert.equal(urls.some((url) => url.includes("Sheet1")), false);
  });

  it("returns no rows when Google omits values", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);

      if (url.includes("/values/")) {
        return Response.json({});
      }

      return Response.json({
        spreadsheetId: "spreadsheet-1",
        properties: { title: "Products" },
        sheets: [
          { properties: { sheetId: 0, title: "Sheet1", index: 0 } },
        ],
      });
    };

    const records = await readWorksheetRecords("token", "spreadsheet-1", 0);

    assert.deepEqual(records.rows, []);
  });

  it("rejects a worksheet that is not on the spreadsheet", async () => {
    let valueReads = 0;
    globalThis.fetch = async (input) => {
      if (String(input).includes("/values/")) {
        valueReads += 1;
      }

      return Response.json({
        spreadsheetId: "spreadsheet-1",
        properties: { title: "Products" },
        sheets: [
          { properties: { sheetId: 0, title: "Sheet1", index: 0 } },
        ],
      });
    };

    await assert.rejects(
      () => readWorksheetRecords("token", "spreadsheet-1", 9),
      WorksheetNotFoundError,
    );
    assert.equal(valueReads, 0);
  });

  it("turns a Google authorization failure into a sheets error", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { errors: [{ reason: "authError" }] } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    await assert.rejects(
      () => readWorksheetRecords("token", "spreadsheet-1", 0),
      (error: unknown) => {
        assert.equal(error instanceof Error ? error.name : "", "GoogleSheetsError");
        return true;
      },
    );
  });
});
