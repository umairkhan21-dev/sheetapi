import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { worksheetValuesToRecords } from "./google-worksheets";
import {
  pageWorksheetRows,
  PUBLIC_API_LIMIT_DEFAULT,
  PUBLIC_API_LIMIT_MAX,
  PUBLIC_API_OFFSET_MAX,
  readPublicPagination,
} from "./public-api-pagination";

const SHEET = [
  ["id", "name", "price", ""],
  ["1", "Pen", "20", ""],
  ["2", "Book", "100", "yes"],
  ["", ""],
  ["4", "Paper", "5", ""],
  ["5", "Ink", "8", ""],
];

function pageOf(query: string) {
  return readPublicPagination(new URLSearchParams(query));
}

function rowsFor(query: string) {
  const page = pageOf(query);
  assert.equal(page.ok, true);

  if (!page.ok) {
    throw new Error("pagination was not accepted");
  }

  return pageWorksheetRows(worksheetValuesToRecords(SHEET).rows, page.page);
}

describe("public API pagination", () => {
  it("uses the existing row ceiling when limit and offset are omitted", () => {
    const page = pageOf("");
    assert.equal(page.ok, true);

    if (!page.ok) {
      return;
    }

    assert.deepEqual(page.page, {
      offset: 0,
      limit: PUBLIC_API_LIMIT_DEFAULT,
    });
    assert.equal(PUBLIC_API_LIMIT_DEFAULT, PUBLIC_API_LIMIT_MAX);
    assert.deepEqual(
      rowsFor(""),
      worksheetValuesToRecords(SHEET).rows,
    );
  });

  it("returns the first data rows when only limit is set", () => {
    assert.deepEqual(
      rowsFor("limit=3").map((row) => row.id),
      ["1", "2", ""],
    );
    assert.deepEqual(
      rowsFor("limit=0002").map((row) => row.id),
      ["1", "2"],
    );
  });

  it("skips data rows when only offset is set", () => {
    assert.deepEqual(
      rowsFor("offset=2").map((row) => row.id),
      ["", "4", "5"],
    );
  });

  it("applies limit and offset to data rows and keeps header mapping", () => {
    const first = rowsFor("limit=1&offset=0");
    const second = rowsFor("limit=1&offset=1");
    const acrossBlank = rowsFor("limit=2&offset=2");

    assert.deepEqual(first, [
      { id: "1", name: "Pen", price: "20", "Column 4": "" },
    ]);
    assert.deepEqual(second, [
      { id: "2", name: "Book", price: "100", "Column 4": "yes" },
    ]);
    assert.deepEqual(Object.keys(first[0] ?? {}), Object.keys(second[0] ?? {}));
    assert.deepEqual(
      pageWorksheetRows(
        worksheetValuesToRecords([
          ["name", "name"],
          ["Pen", "Blue"],
          ["Book", "Red"],
        ]).rows,
        { offset: 1, limit: 1 },
      ),
      [{ name: "Book", "name 2": "Red" }],
    );
    assert.deepEqual(acrossBlank, [
      { id: "", name: "", price: "", "Column 4": "" },
      { id: "4", name: "Paper", price: "5", "Column 4": "" },
    ]);
  });

  it("returns an empty array when offset is past the data rows", () => {
    assert.deepEqual(rowsFor("offset=5"), []);
    assert.deepEqual(rowsFor("offset=100"), []);
    assert.deepEqual(rowsFor(`offset=${PUBLIC_API_OFFSET_MAX}`), []);
    assert.deepEqual(
      pageWorksheetRows(worksheetValuesToRecords([]).rows, {
        offset: 0,
        limit: 3,
      }),
      [],
    );
    assert.deepEqual(
      pageWorksheetRows(worksheetValuesToRecords([["id", "name"]]).rows, {
        offset: 0,
        limit: 3,
      }),
      [],
    );
  });

  it("rejects invalid limits", () => {
    for (const query of [
      "limit=0",
      "limit=-1",
      "limit=1.5",
      "limit=",
      "limit",
      "limit=abc",
      "limit=1e2",
      "limit=+3",
      "limit=3.0",
      `limit=${PUBLIC_API_LIMIT_MAX + 1}`,
      `limit=${PUBLIC_API_OFFSET_MAX + 1}1`,
      "limit=1&limit=2",
      "limit=0&offset=-4",
    ]) {
      const page = pageOf(query);
      assert.equal(page.ok, false, query);

      if (page.ok) {
        continue;
      }

      assert.equal(
        page.message,
        `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`,
      );
    }
  });

  it("rejects invalid offsets", () => {
    for (const query of [
      "offset=-1",
      "offset=1.5",
      "offset=",
      "offset",
      "offset=abc",
      "offset=+2",
      "offset=2.0",
      "offset=-0",
      "offset=9007199254740992",
      `offset=${"9".repeat(20)}`,
      "offset=1&offset=2",
    ]) {
      const page = pageOf(query);
      assert.equal(page.ok, false, query);

      if (page.ok) {
        continue;
      }

      assert.equal(
        page.message,
        `offset must be a whole number from 0 to ${PUBLIC_API_OFFSET_MAX}.`,
      );
    }
  });

  it("accepts the maximum limit and a zero offset", () => {
    const page = pageOf(`limit=${PUBLIC_API_LIMIT_MAX}&offset=0`);
    assert.equal(page.ok, true);

    if (!page.ok) {
      return;
    }

    assert.deepEqual(page.page, {
      offset: 0,
      limit: PUBLIC_API_LIMIT_MAX,
    });
  });
});
