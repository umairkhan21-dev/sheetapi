import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { API_CELL_LENGTH } from "./google-worksheets";
import {
  deleteDimensionIndexes,
  isPublicRowInRange,
  mergePatchedRow,
  parsePublicJsonObject,
  publicRowOutOfRangeMessage,
  readPublicJsonContentType,
  readPublicRowNumber,
  validatePublicRowBody,
  worksheetRowIndex,
} from "./public-api-write";

describe("public API write validation", () => {
  it("requires a data-row rowNumber and rejects the header row", () => {
    assert.deepEqual(readPublicRowNumber(new URLSearchParams()), {
      ok: false,
      message: "rowNumber is required and must identify one data row.",
    });
    assert.deepEqual(
      readPublicRowNumber(new URLSearchParams("rowNumber=1&rowNumber=2")),
      {
        ok: false,
        message: "rowNumber was provided more than once.",
      },
    );
    assert.deepEqual(readPublicRowNumber(new URLSearchParams("rowNumber=1")), {
      ok: false,
      message: "rowNumber 1 is the header row and cannot be changed.",
    });
    assert.deepEqual(readPublicRowNumber(new URLSearchParams("rowNumber=0")), {
      ok: false,
      message: "rowNumber must be a positive integer.",
    });
    assert.deepEqual(readPublicRowNumber(new URLSearchParams("rowNumber=2.5")), {
      ok: false,
      message: "rowNumber must be a positive integer.",
    });
    assert.deepEqual(readPublicRowNumber(new URLSearchParams("rowNumber=2")), {
      ok: true,
      rowNumber: 2,
    });
  });

  it("maps worksheet row numbers to zero-based deleteDimension indexes", () => {
    assert.equal(worksheetRowIndex(2), 1);
    assert.deepEqual(deleteDimensionIndexes(2), {
      startIndex: 1,
      endIndex: 2,
    });
    assert.deepEqual(deleteDimensionIndexes(5), {
      startIndex: 4,
      endIndex: 5,
    });
    assert.equal(isPublicRowInRange(2, 1), true);
    assert.equal(isPublicRowInRange(3, 1), false);
    assert.equal(isPublicRowInRange(1, 3), false);
    assert.equal(
      publicRowOutOfRangeMessage(9),
      "rowNumber 9 is outside this worksheet.",
    );
  });

  it("parses JSON objects and rejects arrays, null, and malformed bodies", () => {
    assert.deepEqual(parsePublicJsonObject('{"id":"7"}'), {
      ok: true,
      body: { id: "7" },
    });
    assert.deepEqual(parsePublicJsonObject("null"), {
      ok: false,
      message: "The request body must be a JSON object.",
    });
    assert.deepEqual(parsePublicJsonObject("[1]"), {
      ok: false,
      message: "The request body must be a JSON object, not an array.",
    });
    assert.deepEqual(parsePublicJsonObject("{"), {
      ok: false,
      message: "The request body must be valid JSON.",
    });
    assert.deepEqual(readPublicJsonContentType("application/json; charset=utf-8"), {
      ok: true,
    });
    assert.deepEqual(readPublicJsonContentType("text/plain"), {
      ok: false,
      message: "Content-Type must be application/json.",
    });
  });

  it("validates create and replace bodies against headers without shifting columns", () => {
    const columns = ["id", "name", "city"];
    const created = validatePublicRowBody(
      { city: "paris", id: "7" },
      columns,
      "create",
    );

    assert.equal(created.ok, true);

    if (!created.ok) {
      return;
    }

    assert.deepEqual(created.values, ["7", "", "paris"]);
    assert.deepEqual(created.row, { id: "7", name: "", city: "paris" });

    const empty = validatePublicRowBody({}, columns, "create");
    assert.equal(empty.ok, false);

    if (empty.ok) {
      return;
    }

    assert.equal(empty.message, "The request body must include at least one field.");

    const unknown = validatePublicRowBody({ town: "paris" }, columns, "replace");
    assert.equal(unknown.ok, false);

    if (unknown.ok) {
      return;
    }

    assert.equal(unknown.message, "town is not a column in this worksheet.");

    const noHeaders = validatePublicRowBody({ id: "1" }, [], "create");
    assert.equal(noHeaders.ok, false);

    if (noHeaders.ok) {
      return;
    }

    assert.equal(noHeaders.message, "This worksheet has no header row.");

    const badType = validatePublicRowBody({ id: { nested: true } }, columns, "create");
    assert.equal(badType.ok, false);

    if (badType.ok) {
      return;
    }

    assert.equal(badType.message, "id must be a string, number, or boolean.");

    const long = validatePublicRowBody(
      { id: "x".repeat(API_CELL_LENGTH + 1) },
      columns,
      "create",
    );
    assert.equal(long.ok, false);
  });

  it("patches only supplied fields and preserves the rest", () => {
    const columns = ["id", "name", "city"];
    const patched = validatePublicRowBody({ city: "rome" }, columns, "patch");

    assert.equal(patched.ok, true);

    if (!patched.ok) {
      return;
    }

    assert.deepEqual(patched.row, { city: "rome" });

    const merged = mergePatchedRow(
      { id: "1", name: "luna", city: "paris" },
      columns,
      patched.row,
    );

    assert.deepEqual(merged.row, {
      id: "1",
      name: "luna",
      city: "rome",
    });
    assert.deepEqual(merged.values, ["1", "luna", "rome"]);

    const replaced = validatePublicRowBody({ city: "rome" }, columns, "replace");
    assert.equal(replaced.ok, true);

    if (!replaced.ok) {
      return;
    }

    assert.deepEqual(replaced.row, { id: "", name: "", city: "rome" });
    assert.deepEqual(replaced.values, ["", "", "rome"]);
  });
});
