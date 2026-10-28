import { API_CELL_LENGTH } from "@/lib/google-worksheets";

export const PUBLIC_ROW_NUMBER_PARAM = "rowNumber";

export type PublicWriteMode = "create" | "replace" | "patch";

export type PublicRowNumber =
  | { ok: true; rowNumber: number }
  | { ok: false; message: string };

export type PublicRowBody =
  | { ok: true; values: string[]; row: Record<string, string> }
  | { ok: false; message: string };

/**
 * Worksheet row numbers match Google Sheets: row 1 is the header.
 * Data rows start at 2. PUT, PATCH, and DELETE never target row 1.
 */
export function readPublicRowNumber(
  searchParams: URLSearchParams,
): PublicRowNumber {
  const values = searchParams.getAll(PUBLIC_ROW_NUMBER_PARAM);

  if (values.length === 0) {
    return {
      ok: false,
      message: "rowNumber is required and must identify one data row.",
    };
  }

  if (values.length > 1) {
    return {
      ok: false,
      message: "rowNumber was provided more than once.",
    };
  }

  const raw = values[0] ?? "";

  if (!/^\d+$/.test(raw)) {
    return {
      ok: false,
      message: "rowNumber must be a positive integer.",
    };
  }

  const rowNumber = Number(raw);

  if (!Number.isSafeInteger(rowNumber) || rowNumber < 1) {
    return {
      ok: false,
      message: "rowNumber must be a positive integer.",
    };
  }

  if (rowNumber === 1) {
    return {
      ok: false,
      message: "rowNumber 1 is the header row and cannot be changed.",
    };
  }

  return { ok: true, rowNumber };
}

export function isPublicRowInRange(
  rowNumber: number,
  dataRowCount: number,
): boolean {
  return rowNumber >= 2 && rowNumber <= dataRowCount + 1;
}

export function publicRowOutOfRangeMessage(rowNumber: number) {
  return `rowNumber ${rowNumber} is outside this worksheet.`;
}

export function worksheetRowIndex(rowNumber: number) {
  return rowNumber - 1;
}

export function deleteDimensionIndexes(rowNumber: number) {
  const startIndex = worksheetRowIndex(rowNumber);

  return {
    startIndex,
    endIndex: startIndex + 1,
  };
}

export function parsePublicJsonObject(
  text: string,
): { ok: true; body: Record<string, unknown> } | { ok: false; message: string } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, message: "The request body must be valid JSON." };
  }

  if (parsed === null) {
    return { ok: false, message: "The request body must be a JSON object." };
  }

  if (Array.isArray(parsed)) {
    return {
      ok: false,
      message: "The request body must be a JSON object, not an array.",
    };
  }

  if (typeof parsed !== "object") {
    return { ok: false, message: "The request body must be a JSON object." };
  }

  return { ok: true, body: parsed as Record<string, unknown> };
}

export function readPublicJsonContentType(contentType: string | null) {
  if (contentType == null || contentType.trim().length === 0) {
    return {
      ok: false as const,
      message: "Content-Type must be application/json.",
    };
  }

  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";

  if (mediaType !== "application/json") {
    return {
      ok: false as const,
      message: "Content-Type must be application/json.",
    };
  }

  return { ok: true as const };
}

export function validatePublicRowBody(
  body: Record<string, unknown>,
  columns: readonly string[],
  mode: PublicWriteMode,
): PublicRowBody {
  if (columns.length === 0) {
    return {
      ok: false,
      message: "This worksheet has no header row.",
    };
  }

  const keys = Object.keys(body);

  if (keys.length === 0) {
    return {
      ok: false,
      message: "The request body must include at least one field.",
    };
  }

  const columnSet = new Set(columns);

  for (const key of keys) {
    if (!columnSet.has(key)) {
      return {
        ok: false,
        message: `${key} is not a column in this worksheet.`,
      };
    }
  }

  if (mode === "patch") {
    const row: Record<string, string> = {};
    const values: string[] = [];

    for (const column of columns) {
      if (!Object.prototype.hasOwnProperty.call(body, column)) {
        continue;
      }

      const cell = cellValue(body[column], column);

      if (!cell.ok) {
        return cell;
      }

      row[column] = cell.value;
      values.push(cell.value);
    }

    return { ok: true, values, row };
  }

  const row: Record<string, string> = {};
  const values: string[] = [];

  for (const column of columns) {
    if (!Object.prototype.hasOwnProperty.call(body, column)) {
      row[column] = "";
      values.push("");
      continue;
    }

    const cell = cellValue(body[column], column);

    if (!cell.ok) {
      return cell;
    }

    row[column] = cell.value;
    values.push(cell.value);
  }

  return { ok: true, values, row };
}

export function mergePatchedRow(
  existing: Record<string, string>,
  columns: readonly string[],
  patch: Record<string, string>,
): { values: string[]; row: Record<string, string> } {
  const row: Record<string, string> = {};
  const values: string[] = [];

  for (const column of columns) {
    const value = Object.prototype.hasOwnProperty.call(patch, column)
      ? (patch[column] ?? "")
      : (existing[column] ?? "");
    row[column] = value;
    values.push(value);
  }

  return { values, row };
}

function cellValue(
  value: unknown,
  column: string,
): { ok: true; value: string } | { ok: false; message: string } {
  if (value === null) {
    return {
      ok: false,
      message: `${column} must be a string, number, or boolean.`,
    };
  }

  if (typeof value === "string") {
    if (value.length > API_CELL_LENGTH) {
      return {
        ok: false,
        message: `${column} exceeds the ${API_CELL_LENGTH} character limit.`,
      };
    }

    return { ok: true, value };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return {
        ok: false,
        message: `${column} must be a string, number, or boolean.`,
      };
    }

    const text = String(value);

    if (text.length > API_CELL_LENGTH) {
      return {
        ok: false,
        message: `${column} exceeds the ${API_CELL_LENGTH} character limit.`,
      };
    }

    return { ok: true, value: text };
  }

  if (typeof value === "boolean") {
    return { ok: true, value: value ? "TRUE" : "FALSE" };
  }

  return {
    ok: false,
    message: `${column} must be a string, number, or boolean.`,
  };
}
