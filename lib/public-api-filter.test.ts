import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { API_CELL_LENGTH, worksheetValuesToRecords } from "./google-worksheets";
import {
  filterWorksheetRows,
  publicApiEmptyFilterMessage,
  publicApiRepeatedFilterMessage,
  publicApiUnknownFilterMessage,
  readPublicFilters,
  unknownPublicFilterColumn,
} from "./public-api-filter";
import { pageWorksheetRows, readPublicPagination } from "./public-api-pagination";

const SHEET = [
  ["id", "name", "city"],
  ["1", "raven", "london"],
  ["2", "tony", "middle earth"],
  ["3", "hermoine", "london"],
  ["4", "harry", "london"],
];

function recordsFor(values: string[][]) {
  return worksheetValuesToRecords(values);
}

function queryResult(query: string, values: string[][] = SHEET) {
  const params = new URLSearchParams(query);
  const filters = readPublicFilters(params);
  assert.equal(filters.ok, true, query);

  if (!filters.ok) {
    throw new Error("filters were not accepted");
  }

  const records = recordsFor(values);
  const unknown = unknownPublicFilterColumn(filters.filters, records.columns);
  assert.equal(unknown, null, query);

  const page = readPublicPagination(params);
  assert.equal(page.ok, true, query);

  if (!page.ok) {
    throw new Error("pagination was not accepted");
  }

  return pageWorksheetRows(
    filterWorksheetRows(records.rows, filters.filters, filters.search),
    page.page,
  );
}

describe("public API filtering", () => {
  it("returns every data row when no filter is present", () => {
    assert.deepEqual(queryResult(""), recordsFor(SHEET).rows);
    assert.deepEqual(queryResult("limit=10&offset=0"), recordsFor(SHEET).rows);
  });

  it("returns rows whose column equals the filter value", () => {
    assert.deepEqual(
      queryResult("city=london").map((row) => row.name),
      ["raven", "hermoine", "harry"],
    );
    assert.deepEqual(queryResult("name=tony"), [
      { id: "2", name: "tony", city: "middle earth" },
    ]);
  });

  it("returns an empty array when a valid filter matches nothing", () => {
    assert.deepEqual(queryResult("city=paris"), []);
    assert.deepEqual(queryResult("name=ton"), []);
    assert.deepEqual(queryResult("city=london&name=tony"), []);
  });

  it("requires every filter to match", () => {
    assert.deepEqual(queryResult("city=london&name=hermoine"), [
      { id: "3", name: "hermoine", city: "london" },
    ]);
    assert.deepEqual(queryResult("name=hermoine&city=london"), [
      { id: "3", name: "hermoine", city: "london" },
    ]);
  });

  it("compares column names and cell values as exact case-sensitive strings", () => {
    assert.deepEqual(queryResult("city=London"), []);
    assert.deepEqual(queryResult("name=Tony"), []);
    assert.deepEqual(queryResult("name=raven"), [
      { id: "1", name: "raven", city: "london" },
    ]);

    const spaced = recordsFor([
      [" city ", "name"],
      ["london", "raven"],
      [" london", "harry"],
    ]);
    assert.deepEqual(spaced.columns, ["city", "name"]);
    assert.deepEqual(
      filterWorksheetRows(spaced.rows, [{ column: "city", value: "london" }]),
      [{ city: "london", name: "raven" }],
    );
    assert.equal(
      unknownPublicFilterColumn([{ column: " city ", value: "london" }], spaced.columns),
      " city ",
    );
    assert.equal(
      unknownPublicFilterColumn([{ column: "City", value: "london" }], spaced.columns),
      "City",
    );

    const decoded = readPublicFilters(new URLSearchParams("name=tony+stark"));
    assert.equal(decoded.ok, true);

    if (!decoded.ok) {
      return;
    }

    assert.deepEqual(decoded.filters, [{ column: "name", value: "tony stark" }]);
    assert.deepEqual(queryResult("city=london%20"), []);
    assert.deepEqual(queryResult("name=harry%20potter"), []);
  });

  it("filters before limit and offset and keeps the original row order", () => {
    assert.deepEqual(
      queryResult("city=london&limit=2&offset=1").map((row) => row.name),
      ["hermoine", "harry"],
    );
    assert.deepEqual(
      queryResult("city=london&offset=0&limit=2").map((row) => row.id),
      ["1", "3"],
    );
    assert.deepEqual(queryResult("city=london&offset=3"), []);
    assert.deepEqual(
      queryResult("limit=1&offset=1&city=london"),
      [{ id: "3", name: "hermoine", city: "london" }],
    );

    const original = recordsFor(SHEET).rows;
    const snapshot = original.map((row) => ({ ...row }));
    const matched = filterWorksheetRows(original, [
      { column: "city", value: "london" },
    ]);
    assert.deepEqual(original, snapshot);
    assert.deepEqual(
      matched.map((row) => row.id),
      ["1", "3", "4"],
    );
  });

  it("does not treat limit or offset as column filters", () => {
    const values = [
      ["limit", "offset", "city"],
      ["no", "9", "london"],
      ["2", "1", "paris"],
      ["1", "0", "london"],
    ];
    const parsed = readPublicFilters(new URLSearchParams("limit=1&offset=1&city=london"));
    assert.equal(parsed.ok, true);

    if (!parsed.ok) {
      return;
    }

    assert.deepEqual(parsed.filters, [{ column: "city", value: "london" }]);
    assert.deepEqual(
      queryResult("limit=1", values),
      [{ limit: "no", offset: "9", city: "london" }],
    );
    assert.deepEqual(
      queryResult("offset=1&limit=1", values),
      [{ limit: "2", offset: "1", city: "paris" }],
    );
    assert.deepEqual(
      queryResult("city=london&limit=1&offset=1", values),
      [{ limit: "1", offset: "0", city: "london" }],
    );
  });

  it("matches derived header keys and compares values without executing them", () => {
    const values = [
      ["name", "name", "note", ""],
      ["Pen", "Blue", "plain", ""],
      ["Book", "Red", "tony'; DROP TABLE api; --", "kept"],
      ["Pen", "Blue", ".*", ""],
    ];
    const params = new URLSearchParams();
    params.append("name", "Book");
    params.append("name 2", "Red");
    params.append("note", "tony'; DROP TABLE api; --");
    const filters = readPublicFilters(params);
    assert.equal(filters.ok, true);

    if (!filters.ok) {
      return;
    }

    const records = recordsFor(values);
    assert.equal(unknownPublicFilterColumn(filters.filters, records.columns), null);
    assert.deepEqual(filterWorksheetRows(records.rows, filters.filters), [
      {
        name: "Book",
        "name 2": "Red",
        note: "tony'; DROP TABLE api; --",
        "Column 4": "kept",
      },
    ]);
    assert.deepEqual(
      filterWorksheetRows(records.rows, [{ column: "note", value: ".*" }]),
      [
        {
          name: "Pen",
          "name 2": "Blue",
          note: ".*",
          "Column 4": "",
        },
      ],
    );
    assert.deepEqual(
      filterWorksheetRows(records.rows, [{ column: "name", value: "Pe" }]),
      [],
    );
    assert.deepEqual(
      queryResult("Column%204=kept", values).map((row) => row.name),
      ["Book"],
    );
  });

  it("rejects repeated parameters, empty values, and unknown columns", () => {
    const columns = recordsFor(SHEET).columns;

    for (const [query, message] of [
      ["city=london&city=paris", publicApiRepeatedFilterMessage("city")],
      ["city=london&city=london", publicApiRepeatedFilterMessage("city")],
      ["name=tony&city=london&city=paris", publicApiRepeatedFilterMessage("city")],
      ["city=", publicApiEmptyFilterMessage("city")],
      ["city", publicApiEmptyFilterMessage("city")],
      ["name=tony&city=", publicApiEmptyFilterMessage("city")],
      ["=london", "A filter name is required."],
      [`${"c".repeat(API_CELL_LENGTH + 1)}=london`, "A filter name is too long."],
    ] as const) {
      const filters = readPublicFilters(new URLSearchParams(query));
      assert.equal(filters.ok, false, query);

      if (filters.ok) {
        continue;
      }

      assert.equal(filters.message, message);
    }

    const space = readPublicFilters(new URLSearchParams("city=+"));
    assert.equal(space.ok, true);

    if (!space.ok) {
      return;
    }

    assert.deepEqual(space.filters, [{ column: "city", value: " " }]);
    assert.equal(
      unknownPublicFilterColumn([{ column: "town", value: "london" }], columns),
      "town",
    );
    assert.equal(
      publicApiUnknownFilterMessage("town"),
      "town is not a column in this worksheet.",
    );
    assert.equal(
      unknownPublicFilterColumn(
        [
          { column: "city", value: "london" },
          { column: "town", value: "london" },
        ],
        columns,
      ),
      "town",
    );
  });

  it("returns no rows for an empty or header-only sheet when the column exists", () => {
    assert.deepEqual(recordsFor([]).columns, []);
    assert.deepEqual(recordsFor([]).rows, []);
    assert.equal(
      unknownPublicFilterColumn([{ column: "city", value: "london" }], recordsFor([]).columns),
      "city",
    );
    assert.deepEqual(queryResult("", []), []);
    assert.deepEqual(
      queryResult("", [["id", "name", "city"]]),
      [],
    );
    assert.deepEqual(queryResult("city=london", [["id", "name", "city"]]), []);
    assert.equal(
      unknownPublicFilterColumn(
        [{ column: "town", value: "london" }],
        recordsFor([["id", "name", "city"]]).columns,
      ),
      "town",
    );
  });

  it("keeps asterisks literal in exact filters and adds column operators", () => {
    const values = [
      ["name", "note", "code"],
      ["hermoine", "star*", "\\path"],
      ["Hermione", ".*", "a\\b"],
      ["tony", "*", "\\"],
      ["", "star", "n"],
    ];

    assert.deepEqual(queryResult("note=*", values).map((row) => row.name), ["tony"]);
    assert.deepEqual(queryResult("note=.*", values).map((row) => row.name), ["Hermione"]);
    assert.deepEqual(queryResult("name__contains=herm", values).map((row) => row.name), [
      "hermoine",
    ]);
    assert.deepEqual(queryResult("name__contains=HERM", values), []);
    assert.deepEqual(queryResult("name__starts=her", values).map((row) => row.name), [
      "hermoine",
    ]);
    assert.deepEqual(queryResult("name__ends=ny", values).map((row) => row.name), ["tony"]);
    assert.deepEqual(queryResult("name__icontains=HERM", values).map((row) => row.name), [
      "hermoine",
      "Hermione",
    ]);
    assert.deepEqual(queryResult("name__istarts=HER", values).map((row) => row.name), [
      "hermoine",
      "Hermione",
    ]);
    assert.deepEqual(queryResult("name__iends=NE", values).map((row) => row.name), [
      "hermoine",
      "Hermione",
    ]);
    assert.deepEqual(queryResult("note__contains=*", values).map((row) => row.name), [
      "hermoine",
      "Hermione",
      "tony",
    ]);
    assert.deepEqual(queryResult("name__contains=herm&note__ends=*", values), [
      { name: "hermoine", note: "star*", code: "\\path" },
    ]);
  });

  it("matches wildcards with literal segments instead of a regular expression", () => {
    const values = [
      ["name", "note"],
      ["hermoine", "a*b"],
      ["harry", "ab"],
      ["", ""],
      ["star", "*"],
      ["slash", "\\"],
      ["pair", "\\a"],
      ["axxb", "a\\b"],
    ];

    assert.deepEqual(queryResult("name__wildcard=h*e", values).map((row) => row.name), [
      "hermoine",
    ]);
    assert.deepEqual(queryResult("name__wildcard=h**e", values).map((row) => row.name), [
      "hermoine",
    ]);
    assert.deepEqual(queryResult("name__wildcard=*", values).map((row) => row.name), [
      "hermoine",
      "harry",
      "",
      "star",
      "slash",
      "pair",
      "axxb",
    ]);
    assert.deepEqual(queryResult("name__wildcard=**", values).map((row) => row.note).length, 7);
    assert.deepEqual(queryResult("note__wildcard=a*b", values).map((row) => row.name), [
      "hermoine",
      "harry",
      "axxb",
    ]);
    assert.deepEqual(queryResult("note__wildcard=a**b", values).map((row) => row.name), [
      "hermoine",
      "harry",
      "axxb",
    ]);
    assert.deepEqual(
      queryResult(`note__wildcard=${encodeURIComponent("\\*")}`, values).map((row) => row.name),
      ["star"],
    );
    assert.deepEqual(
      queryResult(`note__wildcard=${encodeURIComponent("\\\\")}`, values).map((row) => row.name),
      ["slash"],
    );
    assert.deepEqual(
      queryResult(`note__wildcard=${encodeURIComponent("\\a")}`, values).map((row) => row.name),
      ["pair"],
    );
    assert.deepEqual(
      queryResult(`note__wildcard=${encodeURIComponent("\\")}`, [
        ["note"],
        ["\\"],
        ["\\\\"],
      ]),
      [{ note: "\\" }],
    );
    assert.deepEqual(
      queryResult(`note__wildcard=${encodeURIComponent("a\\")}`, [
        ["note"],
        ["a\\"],
        ["a"],
        ["\\a"],
      ]),
      [{ note: "a\\" }],
    );
    assert.deepEqual(
      queryResult(`code__wildcard=${encodeURIComponent("\\\\")}`, [
        ["code"],
        ["\\"],
        ["a"],
      ]),
      [{ code: "\\" }],
    );
    assert.deepEqual(queryResult("name__wildcard=herm*oine", values).map((row) => row.name), [
      "hermoine",
    ]);
    assert.deepEqual(queryResult("note__wildcard=b*b", [["note"], ["bb"], ["bab"], ["b"]]), [
      { note: "bb" },
      { note: "bab" },
    ]);
  });

  it("searches every column with q and combines every clause with AND", () => {
    assert.deepEqual(queryResult("q=ton").map((row) => row.name), ["tony"]);
    assert.deepEqual(queryResult("q=london").map((row) => row.id), ["1", "3", "4"]);
    assert.deepEqual(queryResult("q=London"), []);
    assert.deepEqual(queryResult("q=*", [["name", "note"], ["a", "*"], ["*", "b"]]).map((row) => row.name), [
      "a",
      "*",
    ]);
    assert.deepEqual(queryResult("q=pen&city=paris", [
      ["name", "city"],
      ["pen", "london"],
      ["pencil", "paris"],
      ["pen", "paris"],
    ]), [
      { name: "pencil", city: "paris" },
      { name: "pen", city: "paris" },
    ]);
    assert.deepEqual(
      queryResult("q=on&name__starts=t&limit=1&offset=0").map((row) => row.name),
      ["tony"],
    );
    assert.deepEqual(queryResult("q=london&limit=1&offset=1").map((row) => row.name), [
      "hermoine",
    ]);

    const reserved = [
      ["q", "name"],
      ["pen", "other"],
      ["no", "pencil"],
    ];
    const reservedQuery = readPublicFilters(new URLSearchParams("q=pen"));
    assert.equal(reservedQuery.ok, true);

    if (!reservedQuery.ok) {
      return;
    }

    assert.equal(reservedQuery.search, "pen");
    assert.deepEqual(reservedQuery.filters, []);
    assert.deepEqual(queryResult("q=pen", reserved).map((row) => row.name), ["other", "pencil"]);
  });

  it("applies operators to blank, missing, and normalized headers", () => {
    const values = [
      ["name", "name", "", "name__contains"],
      ["Pen", "Blue", "", "en"],
      ["Book", "Red", "kept", "den"],
      ["", "", "", ""],
    ];
    const records = recordsFor(values);
    assert.deepEqual(records.columns, ["name", "name 2", "Column 3", "name__contains"]);
    assert.deepEqual(queryResult("name__contains=en", values), [
      { name: "Pen", "name 2": "Blue", "Column 3": "", "name__contains": "en" },
    ]);
    assert.deepEqual(queryResult("name 2__contains=e", values).map((row) => row.name), [
      "Pen",
      "Book",
    ]);
    assert.deepEqual(queryResult("Column%203__starts=ke", values).map((row) => row.name), [
      "Book",
    ]);
    assert.deepEqual(queryResult("name__wildcard=*", values).map((row) => row["name__contains"]), [
      "en",
      "den",
      "",
    ]);
    const missing = recordsFor([
      ["name", "city"],
      ["ada"],
    ]);
    assert.equal(missing.rows[0]?.city, "");
    assert.deepEqual(
      filterWorksheetRows(missing.rows, [{ column: "city__contains", value: "a" }]),
      [],
    );
    assert.deepEqual(
      filterWorksheetRows(missing.rows, [{ column: "city__wildcard", value: "*" }]),
      [{ name: "ada", city: "" }],
    );
  });

  it("rejects repeated and empty operators before treating a suffix header as exact", () => {
    for (const [query, message] of [
      ["name__contains=", publicApiEmptyFilterMessage("name__contains")],
      ["name__contains", publicApiEmptyFilterMessage("name__contains")],
      ["q=", publicApiEmptyFilterMessage("q")],
      ["q", publicApiEmptyFilterMessage("q")],
      ["q=pen&q=ton", publicApiRepeatedFilterMessage("q")],
      [
        "name__starts=a&name__starts=b",
        publicApiRepeatedFilterMessage("name__starts"),
      ],
      ["name__wildcard=", publicApiEmptyFilterMessage("name__wildcard")],
    ] as const) {
      const filters = readPublicFilters(new URLSearchParams(query));
      assert.equal(filters.ok, false, query);

      if (filters.ok) {
        continue;
      }

      assert.equal(filters.message, message);
    }

    const suffixHeader = recordsFor([
      ["name__contains", "name"],
      ["en", "garden"],
      ["den", "end"],
    ]);
    assert.equal(
      unknownPublicFilterColumn(
        [{ column: "name__contains", value: "en" }],
        suffixHeader.columns,
      ),
      null,
    );
    assert.deepEqual(queryResult("name__contains=en", [
      ["name__contains", "name"],
      ["en", "garden"],
      ["den", "end"],
    ]), [{ "name__contains": "en", name: "garden" }]);
    assert.deepEqual(queryResult("name__contains=den", [
      ["name__contains", "name"],
      ["en", "garden"],
      ["den", "end"],
    ]).map((row) => row.name), ["end"]);
    assert.equal(
      unknownPublicFilterColumn(
        [{ column: "town__contains", value: "lon" }],
        recordsFor(SHEET).columns,
      ),
      "town",
    );
    assert.equal(
      unknownPublicFilterColumn(
        [{ column: "name__nope", value: "lon" }],
        recordsFor(SHEET).columns,
      ),
      "name__nope",
    );
  });

  it("leaves pagination validation on limit and offset", () => {
    const page = readPublicPagination(new URLSearchParams("limit=0&city=london"));
    assert.equal(page.ok, false);

    if (page.ok) {
      return;
    }

    assert.match(page.message, /^limit must be a whole number/);
    const offset = readPublicPagination(
      new URLSearchParams("city=london&offset=1&offset=2"),
    );
    assert.equal(offset.ok, false);
  });
});
