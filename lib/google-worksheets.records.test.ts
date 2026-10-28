import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  API_CELL_LENGTH,
  API_COLUMN_LIMIT,
  API_DATA_ROW_LIMIT,
  appendWorksheetRow,
  appendedRowNumber,
  deleteWorksheetRow,
  GoogleSheetsError,
  readWorksheetRecords,
  updateWorksheetRow,
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

  it("accepts exactly 10,000 data rows and keeps a later row after a blank", () => {
    const values = [
      ["id", "name"],
      ...Array.from({ length: API_DATA_ROW_LIMIT - 1 }, (_, index) => [
        String(index + 1),
        "kept",
      ]),
      [],
    ];
    const records = worksheetValuesToRecords(values);

    assert.equal(records.rows.length, API_DATA_ROW_LIMIT);
    assert.deepEqual(records.rows[API_DATA_ROW_LIMIT - 1], {
      id: "",
      name: "",
    });

    const gapped = worksheetValuesToRecords([
      ["id", "name"],
      [],
      ["2", "later"],
    ]);

    assert.deepEqual(gapped.rows, [
      { id: "", name: "" },
      { id: "2", name: "later" },
    ]);
  });

  it("rejects the probe row, a column past the limit, and an oversized cell", () => {
    const full = [
      ["id"],
      ...Array.from({ length: API_DATA_ROW_LIMIT }, () => ["value"]),
    ];

    assert.equal(worksheetValuesToRecords(full).rows.length, API_DATA_ROW_LIMIT);
    assert.throws(
      () => worksheetValuesToRecords([...full, ["probe"]]),
      WorksheetTooLargeError,
    );
    assert.doesNotThrow(() =>
      worksheetValuesToRecords([
        Array.from({ length: API_COLUMN_LIMIT }, () => "column"),
      ]),
    );
    assert.equal(
      worksheetValuesToRecords([["id"], ["x".repeat(API_CELL_LENGTH)]]).rows[0]
        ?.id.length,
      API_CELL_LENGTH,
    );
    assert.throws(
      () =>
        worksheetValuesToRecords([
          ["id"],
          ["x".repeat(API_CELL_LENGTH + 1)],
        ]),
      WorksheetTooLargeError,
    );
    assert.throws(
      () =>
        worksheetValuesToRecords([["x".repeat(API_CELL_LENGTH + 1)], ["ok"]]),
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

  it("requests the probe column and probe row", async () => {
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);

      if (url.includes("/values/")) {
        return Response.json({
          values: [["id"], ["1"]],
        });
      }

      return Response.json(spreadsheetPayload());
    };

    await readWorksheetRecords("token", "spreadsheet-1", 0);
    const valuesUrl = urls.find((url) => url.includes("/values/")) ?? "";

    assert.match(decodeURIComponent(valuesUrl), /A1:GS10002/);
  });
});

describe("worksheet writes stay inside the supported grid", () => {
  it("uses updatedRange and does not append a row past the 10,000 limit", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);

      if (url.includes(":append")) {
        const body = typeof init?.body === "string" ? init.body : "";
        const row = body.includes("last") ? API_DATA_ROW_LIMIT + 1 : 5;

        return Response.json({
          updates: { updatedRange: `'Budget Sheet'!A${row}:B${row}` },
        });
      }

      return Response.json(spreadsheetPayload());
    };

    const rowNumber = await appendWorksheetRow(
      "token",
      "spreadsheet-1",
      0,
      ["7", "luna"],
      1,
    );

    assert.equal(rowNumber, 5);
    assert.equal(calls.filter((call) => call.includes(":append")).length, 1);

    const lastAllowed = await appendWorksheetRow(
      "token",
      "spreadsheet-1",
      0,
      ["last"],
      API_DATA_ROW_LIMIT - 1,
    );
    assert.equal(lastAllowed, API_DATA_ROW_LIMIT + 1);

    calls.length = 0;
    globalThis.fetch = async () => {
      calls.push("called");
      throw new Error("should not reach Google");
    };

    await assert.rejects(
      () =>
        appendWorksheetRow(
          "token",
          "spreadsheet-1",
          0,
          ["next"],
          API_DATA_ROW_LIMIT,
        ),
      WorksheetTooLargeError,
    );
    await assert.rejects(
      () =>
        appendWorksheetRow(
          "token",
          "spreadsheet-1",
          0,
          ["x".repeat(API_CELL_LENGTH + 1)],
          0,
        ),
      WorksheetTooLargeError,
    );
    await assert.rejects(
      () =>
        appendWorksheetRow(
          "token",
          "spreadsheet-1",
          0,
          Array.from({ length: API_COLUMN_LIMIT + 1 }, () => "c"),
          0,
        ),
      WorksheetTooLargeError,
    );
    assert.deepEqual(calls, []);
  });

  it("rejects an append response that landed on the probe row", async () => {
    let appends = 0;
    globalThis.fetch = async (input) => {
      if (String(input).includes(":append")) {
        appends += 1;
        return Response.json({
          updates: { updatedRange: "Sheet1!A10002:A10002" },
        });
      }

      return Response.json(spreadsheetPayload());
    };

    await assert.rejects(
      () => appendWorksheetRow("token", "spreadsheet-1", 0, ["x"], 0),
      WorksheetTooLargeError,
    );
    assert.equal(appends, 1);
    assert.throws(
      () => appendedRowNumber({ updates: { updatedRange: "not-a-range" } }),
      GoogleSheetsError,
    );
  });

  it("does not update or delete outside the supported rows", async () => {
    const calls: string[] = [];
    globalThis.fetch = async () => {
      calls.push("called");
      throw new Error("should not reach Google");
    };

    await assert.rejects(
      () =>
        updateWorksheetRow(
          "token",
          "spreadsheet-1",
          0,
          API_DATA_ROW_LIMIT + 2,
          ["x"],
        ),
      WorksheetTooLargeError,
    );
    await assert.rejects(
      () =>
        updateWorksheetRow("token", "spreadsheet-1", 0, 2, [
          "x".repeat(API_CELL_LENGTH + 1),
        ]),
      WorksheetTooLargeError,
    );
    await assert.rejects(
      () =>
        deleteWorksheetRow(
          "token",
          "spreadsheet-1",
          0,
          API_DATA_ROW_LIMIT + 1,
          API_DATA_ROW_LIMIT + 2,
        ),
      WorksheetTooLargeError,
    );
    assert.deepEqual(calls, []);

    const methods: string[] = [];
    globalThis.fetch = async (input, init) => {
      methods.push(init?.method ?? "GET");

      if ((init?.method ?? "GET") === "PUT") {
        return Response.json({});
      }

      if (String(input).includes(":batchUpdate")) {
        return Response.json({});
      }

      return Response.json(spreadsheetPayload());
    };

    await updateWorksheetRow(
      "token",
      "spreadsheet-1",
      0,
      API_DATA_ROW_LIMIT + 1,
      ["ok"],
    );
    await deleteWorksheetRow(
      "token",
      "spreadsheet-1",
      0,
      API_DATA_ROW_LIMIT,
      API_DATA_ROW_LIMIT + 1,
    );
    assert.equal(methods.includes("PUT"), true);
    assert.equal(
      methods.filter((method) => method === "POST").length > 0,
      true,
    );
  });
});

function spreadsheetPayload() {
  return {
    spreadsheetId: "spreadsheet-1",
    properties: { title: "Products" },
    sheets: [{ properties: { sheetId: 0, title: "Sheet1", index: 0 } }],
  };
}
