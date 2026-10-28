import { API_CELL_LENGTH } from "@/lib/google-worksheets";

// Pagination and global search own these names. A worksheet column with
// the same name cannot be filtered, because the parameter is never a
// column comparison.
const PAGINATION_PARAMETERS = new Set(["limit", "offset"]);
const SEARCH_PARAMETER = "q";

const OPERATOR_SUFFIXES = [
  ["__icontains", "icontains"],
  ["__istarts", "istarts"],
  ["__iends", "iends"],
  ["__wildcard", "wildcard"],
  ["__contains", "contains"],
  ["__starts", "starts"],
  ["__ends", "ends"],
] as const;

type PublicApiOperator = (typeof OPERATOR_SUFFIXES)[number][1];

export type PublicApiFilter = {
  column: string;
  value: string;
};

export type PublicApiRead = {
  filters: PublicApiFilter[];
  search: string | null;
};

export function publicApiRepeatedFilterMessage(name: string) {
  return `${name} was provided more than once.`;
}

export function publicApiEmptyFilterMessage(name: string) {
  return `${name} must not be empty.`;
}

export function publicApiUnknownFilterMessage(name: string) {
  return `${name} is not a column in this worksheet.`;
}

// Syntax only. Column names are checked after the worksheet read because
// the header-derived keys are not stored on the API configuration.
export function readPublicFilters(
  searchParams: URLSearchParams,
): { ok: true } & PublicApiRead | { ok: false; message: string } {
  const filters: PublicApiFilter[] = [];
  const seen = new Set<string>();
  let search: string | null = null;

  for (const name of searchParams.keys()) {
    if (seen.has(name)) {
      continue;
    }

    seen.add(name);

    if (PAGINATION_PARAMETERS.has(name)) {
      continue;
    }

    if (name.length === 0) {
      return { ok: false, message: "A filter name is required." };
    }

    if (name.length > API_CELL_LENGTH) {
      return { ok: false, message: "A filter name is too long." };
    }

    const values = searchParams.getAll(name);

    if (values.length !== 1) {
      return { ok: false, message: publicApiRepeatedFilterMessage(name) };
    }

    const value = values[0] ?? "";

    if (value.length === 0) {
      return { ok: false, message: publicApiEmptyFilterMessage(name) };
    }

    if (name === SEARCH_PARAMETER) {
      search = value;
      continue;
    }

    filters.push({ column: name, value });
  }

  return { ok: true, filters, search };
}

// An exact header wins over an operator suffix. `name__contains` is an
// exact column when that header exists. Otherwise a known suffix selects
// the base header. The returned name is the one the error message uses.
export function unknownPublicFilterColumn(
  filters: readonly PublicApiFilter[],
  columns: readonly string[],
) {
  const names = new Set(columns);

  for (const filter of filters) {
    if (names.has(filter.column)) {
      continue;
    }

    const operator = operatorColumn(filter.column);

    if (operator && names.has(operator.column)) {
      continue;
    }

    return operator?.column ?? filter.column;
  }

  return null;
}

// Every clause must match. `search` matches when any mapped cell contains
// it. Exact column equality is case-sensitive, and an asterisk in an exact
// value is literal. The input order is preserved.
export function filterWorksheetRows<T extends Record<string, string>>(
  rows: readonly T[],
  filters: readonly PublicApiFilter[],
  search: string | null = null,
) {
  if (filters.length === 0 && search == null) {
    return [...rows];
  }

  return rows.filter(
    (row) =>
      filters.every((filter) => rowMatchesFilter(row, filter)) &&
      (search == null || rowMatchesSearch(row, search)),
  );
}

function rowMatchesFilter(row: Record<string, string>, filter: PublicApiFilter) {
  if (Object.hasOwn(row, filter.column)) {
    return row[filter.column] === filter.value;
  }

  const operator = operatorColumn(filter.column);

  if (!operator || !Object.hasOwn(row, operator.column)) {
    return false;
  }

  return cellMatchesOperator(row[operator.column] ?? "", operator.operator, filter.value);
}

function rowMatchesSearch(row: Record<string, string>, search: string) {
  return Object.values(row).some((value) => value.includes(search));
}

function operatorColumn(name: string) {
  for (const [suffix, operator] of OPERATOR_SUFFIXES) {
    if (name.length > suffix.length && name.endsWith(suffix)) {
      return {
        column: name.slice(0, -suffix.length),
        operator,
      };
    }
  }

  return null;
}

function cellMatchesOperator(
  cell: string,
  operator: PublicApiOperator,
  value: string,
) {
  switch (operator) {
    case "contains":
      return cell.includes(value);
    case "starts":
      return cell.startsWith(value);
    case "ends":
      return cell.endsWith(value);
    case "icontains":
      return fold(cell).includes(fold(value));
    case "istarts":
      return fold(cell).startsWith(fold(value));
    case "iends":
      return fold(cell).endsWith(fold(value));
    case "wildcard":
      return wildcardMatch(cell, value);
  }
}

function fold(value: string) {
  return value.toLowerCase();
}

// `*` matches any sequence, including an empty one. In the decoded value,
// `\*` is a literal asterisk and `\\` is a literal backslash. A backslash
// before any other character, or a trailing backslash, stays a backslash.
function wildcardMatch(text: string, pattern: string) {
  const pieces = wildcardPieces(pattern);
  let textIndex = 0;
  let pieceIndex = 0;
  let starPiece = -1;
  let starText = -1;

  while (textIndex < text.length) {
    const piece = pieces[pieceIndex];

    if (piece?.kind === "text" && text.startsWith(piece.value, textIndex)) {
      textIndex += piece.value.length;
      pieceIndex += 1;
      continue;
    }

    if (piece?.kind === "star") {
      starPiece = pieceIndex;
      starText = textIndex;
      pieceIndex += 1;
      continue;
    }

    if (starPiece >= 0) {
      starText += 1;
      textIndex = starText;
      pieceIndex = starPiece + 1;
      continue;
    }

    return false;
  }

  while (pieces[pieceIndex]?.kind === "star") {
    pieceIndex += 1;
  }

  return pieceIndex === pieces.length;
}

function wildcardPieces(pattern: string) {
  const pieces: Array<{ kind: "text"; value: string } | { kind: "star" }> = [];
  let literal = "";

  const pushLiteral = () => {
    if (literal.length === 0) {
      return;
    }

    pieces.push({ kind: "text", value: literal });
    literal = "";
  };

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];

    if (char === "\\") {
      const next = pattern[index + 1];

      if (next === "*" || next === "\\") {
        literal += next;
        index += 1;
        continue;
      }

      literal += "\\";
      continue;
    }

    if (char === "*") {
      pushLiteral();
      pieces.push({ kind: "star" });
      continue;
    }

    literal += char;
  }

  pushLiteral();
  return pieces;
}
