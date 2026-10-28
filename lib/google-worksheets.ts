const SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_SHEETS = 200;
const MAX_TITLE_LENGTH = 200;
const MAX_NAME_LENGTH = 1024;
const MAX_CELL_LENGTH = 2000;
const MAX_SHEET_ID = 2_147_483_647;

export const PREVIEW_ROW_LIMIT = 100;
export const PREVIEW_COLUMN_LIMIT = 50;

// Public API limits. These are not the dashboard preview limits.
// Row 1 is the header. Rows 2–10001 are the 10,000 supported data rows.
// The values read is A1:GS10002: column GS and row 10002 are probes.
// A returned probe means the sheet is past the limit. Google omits empty
// trailing rows and columns, so data that starts after an empty probe is
// outside this read and is not visible here.
export const API_DATA_ROW_LIMIT = 10_000;
export const API_COLUMN_LIMIT = 200;
export const API_CELL_LENGTH = 50_000;
const API_LAST_DATA_ROW = API_DATA_ROW_LIMIT + 1;

const REAUTH_REASONS = new Set([
  "authError",
  "forbidden",
  "insufficientFilePermissions",
  "insufficientPermissions",
]);

const UNAVAILABLE_REASONS = new Set([
  "backendError",
  "dailyLimitExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

export type WorksheetSummary = {
  id: number;
  title: string;
};

export type SpreadsheetWorksheets = {
  id: string;
  name: string;
  sheets: WorksheetSummary[];
};

export type WorksheetPreview = {
  spreadsheet: {
    id: string;
    name: string;
  };
  worksheet: WorksheetSummary;
  columns: string[];
  rows: Record<string, string>[];
  truncated: boolean;
};

export class GoogleSheetsError extends Error {
  readonly httpStatus: number;
  readonly kind:
    | "reauth"
    | "not_found"
    | "unavailable"
    | "invalid"
    | "not_configured";

  constructor(
    httpStatus: number,
    kind:
      | "reauth"
      | "not_found"
      | "unavailable"
      | "invalid"
      | "not_configured",
  ) {
    super("Google Sheets request failed");
    this.name = "GoogleSheetsError";
    this.httpStatus = httpStatus;
    this.kind = kind;
  }
}

export class WorksheetNotFoundError extends Error {
  constructor() {
    super("Worksheet was not found");
    this.name = "WorksheetNotFoundError";
  }
}

export class WorksheetTooLargeError extends Error {
  constructor() {
    super("Worksheet is too large");
    this.name = "WorksheetTooLargeError";
  }
}

export function readSheetId(value: string | null) {
  if (value == null || !/^\d+$/.test(value)) {
    return null;
  }

  const sheetId = Number(value);

  if (!Number.isSafeInteger(sheetId) || sheetId > MAX_SHEET_ID) {
    return null;
  }

  return sheetId;
}

export async function readSpreadsheetWorksheets(
  accessToken: string,
  spreadsheetId: string,
): Promise<SpreadsheetWorksheets> {
  const url = new URL(
    `${SHEETS_API_URL}/${encodeURIComponent(spreadsheetId)}`,
  );
  url.searchParams.set(
    "fields",
    "spreadsheetId,properties.title,sheets.properties(sheetId,title,index)",
  );

  const payload = await fetchSheets(accessToken, url);
  const spreadsheet = parseSpreadsheetWorksheets(payload, spreadsheetId);

  if (!spreadsheet) {
    throw new GoogleSheetsError(0, "unavailable");
  }

  return spreadsheet;
}

export async function readWorksheetPreview(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
): Promise<WorksheetPreview> {
  const spreadsheet = await readSpreadsheetWorksheets(
    accessToken,
    spreadsheetId,
  );
  const worksheet = spreadsheet.sheets.find((sheet) => sheet.id === sheetId);

  if (!worksheet) {
    throw new WorksheetNotFoundError();
  }

  const url = new URL(
    `${SHEETS_API_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(worksheetRange(worksheet.title))}`,
  );
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");

  const payload = await fetchSheets(accessToken, url);

  return buildWorksheetPreview(spreadsheet, worksheet, payload);
}

export type WorksheetRecords = {
  spreadsheet: {
    id: string;
    name: string;
  };
  worksheet: WorksheetSummary;
  columns: string[];
  rows: Record<string, string>[];
};

export async function readWorksheetRecords(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
): Promise<WorksheetRecords> {
  const spreadsheet = await readSpreadsheetWorksheets(
    accessToken,
    spreadsheetId,
  );
  const worksheet = spreadsheet.sheets.find((sheet) => sheet.id === sheetId);

  if (!worksheet) {
    throw new WorksheetNotFoundError();
  }

  const url = new URL(
    `${SHEETS_API_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(apiWorksheetRange(worksheet.title))}`,
  );
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");

  const payload = await fetchSheets(accessToken, url);
  const records = worksheetValuesToRecords(readValueRows(payload));

  return {
    spreadsheet: {
      id: spreadsheet.id,
      name: spreadsheet.name,
    },
    worksheet,
    columns: records.columns,
    rows: records.rows,
  };
}

export async function appendWorksheetRow(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  values: readonly string[],
  dataRowCount: number,
): Promise<number> {
  assertCellsWithinLimits(values);

  if (
    !Number.isSafeInteger(dataRowCount) ||
    dataRowCount < 0 ||
    dataRowCount >= API_DATA_ROW_LIMIT
  ) {
    throw new WorksheetTooLargeError();
  }

  const worksheet = await requireWorksheet(accessToken, spreadsheetId, sheetId);
  const range = `'${quotedSheetTitle(worksheet.title)}'!A:${columnName(Math.max(values.length, 1))}`;
  const url = new URL(
    `${SHEETS_API_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`,
  );
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  url.searchParams.set("insertDataOption", "INSERT_ROWS");
  url.searchParams.set("includeValuesInResponse", "false");

  const payload = await fetchSheets(accessToken, url, {
    method: "POST",
    body: JSON.stringify({
      majorDimension: "ROWS",
      values: [values],
    }),
  });

  return appendedRowNumber(payload);
}

export async function updateWorksheetRow(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  rowNumber: number,
  values: readonly string[],
): Promise<void> {
  assertCellsWithinLimits(values);

  if (
    !Number.isSafeInteger(rowNumber) ||
    rowNumber < 2 ||
    rowNumber > API_LAST_DATA_ROW
  ) {
    throw new WorksheetTooLargeError();
  }

  const worksheet = await requireWorksheet(accessToken, spreadsheetId, sheetId);
  const lastColumn = columnName(Math.max(values.length, 1));
  const range = `'${quotedSheetTitle(worksheet.title)}'!A${rowNumber}:${lastColumn}${rowNumber}`;
  const url = new URL(
    `${SHEETS_API_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
  );
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  url.searchParams.set("includeValuesInResponse", "false");

  await fetchSheets(accessToken, url, {
    method: "PUT",
    body: JSON.stringify({
      majorDimension: "ROWS",
      range,
      values: [values],
    }),
  });
}

export async function deleteWorksheetRow(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  startIndex: number,
  endIndex: number,
): Promise<void> {
  if (
    !Number.isSafeInteger(startIndex) ||
    !Number.isSafeInteger(endIndex) ||
    startIndex < 1 ||
    endIndex !== startIndex + 1 ||
    startIndex > API_DATA_ROW_LIMIT
  ) {
    throw new WorksheetTooLargeError();
  }

  await requireWorksheet(accessToken, spreadsheetId, sheetId);

  const url = new URL(
    `${SHEETS_API_URL}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
  );

  await fetchSheets(accessToken, url, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex,
              endIndex,
            },
          },
        },
      ],
    }),
  });
}

async function requireWorksheet(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
) {
  const spreadsheet = await readSpreadsheetWorksheets(
    accessToken,
    spreadsheetId,
  );
  const worksheet = spreadsheet.sheets.find((sheet) => sheet.id === sheetId);

  if (!worksheet) {
    throw new WorksheetNotFoundError();
  }

  return worksheet;
}

export function worksheetValuesToRecords(values: string[][]) {
  if (values.length > API_DATA_ROW_LIMIT + 1) {
    throw new WorksheetTooLargeError();
  }

  const width = values.reduce((max, row) => Math.max(max, row.length), 0);

  if (width > API_COLUMN_LIMIT) {
    throw new WorksheetTooLargeError();
  }

  const header = values[0] ?? [];
  const columns = uniqueHeaders(
    Array.from({ length: width }, (_, index) => {
      const cell = header[index] ?? "";

      if (cell.length > API_CELL_LENGTH) {
        throw new WorksheetTooLargeError();
      }

      return cell;
    }),
  );
  const rows = values.slice(1).map((row) => {
    const record: Record<string, string> = {};

    for (const [index, column] of columns.entries()) {
      const cell = row[index] ?? "";

      if (cell.length > API_CELL_LENGTH) {
        throw new WorksheetTooLargeError();
      }

      record[column] = cell;
    }

    return record;
  });

  return { columns, rows };
}

export function buildWorksheetPreview(
  spreadsheet: SpreadsheetWorksheets,
  worksheet: WorksheetSummary,
  payload: unknown,
): WorksheetPreview {
  const values = readValueRows(payload);
  const header = values[0] ?? [];
  const dataRows = values.slice(1, PREVIEW_ROW_LIMIT + 1);
  const headerWidth = Math.min(header.length, PREVIEW_COLUMN_LIMIT);
  let truncated =
    values.length > PREVIEW_ROW_LIMIT + 1 ||
    header.length > PREVIEW_COLUMN_LIMIT ||
    dataRows.some((row) => row.length > headerWidth);
  const columns = uniqueHeaders(
    header.slice(0, PREVIEW_COLUMN_LIMIT).map((cell) => {
      const text = cellToString(cell);

      if (text.length < cell.length) {
        truncated = true;
      }

      return text;
    }),
  );
  const rows = dataRows.map((row) => {
    const record: Record<string, string> = {};

    for (const [index, column] of columns.entries()) {
      const text = cellToString(row[index]);

      if (typeof row[index] === "string" && text.length < row[index].length) {
        truncated = true;
      }

      record[column] = text;
    }

    return record;
  });

  return {
    spreadsheet: {
      id: spreadsheet.id,
      name: spreadsheet.name,
    },
    worksheet,
    columns,
    rows,
    truncated,
  };
}

function worksheetRange(title: string) {
  const lastColumn = columnName(PREVIEW_COLUMN_LIMIT);
  const lastRow = PREVIEW_ROW_LIMIT + 2;

  return `'${quotedSheetTitle(title)}'!A1:${lastColumn}${lastRow}`;
}

function assertCellsWithinLimits(values: readonly string[]) {
  if (values.length > API_COLUMN_LIMIT) {
    throw new WorksheetTooLargeError();
  }

  for (const value of values) {
    if (value.length > API_CELL_LENGTH) {
      throw new WorksheetTooLargeError();
    }
  }
}

export function appendedRowNumber(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    throw new GoogleSheetsError(0, "invalid");
  }

  const updates = (payload as { updates?: unknown }).updates;

  if (typeof updates !== "object" || updates === null) {
    throw new GoogleSheetsError(0, "invalid");
  }

  const updatedRange = (updates as { updatedRange?: unknown }).updatedRange;

  if (
    typeof updatedRange !== "string" ||
    updatedRange.length === 0 ||
    updatedRange.length > 500
  ) {
    throw new GoogleSheetsError(0, "invalid");
  }

  const match = /!([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?$/.exec(updatedRange);

  if (!match) {
    throw new GoogleSheetsError(0, "invalid");
  }

  const startRow = Number(match[2]);
  const endRow = match[4] == null ? startRow : Number(match[4]);

  if (
    !Number.isSafeInteger(startRow) ||
    !Number.isSafeInteger(endRow) ||
    startRow !== endRow ||
    startRow < 2
  ) {
    throw new GoogleSheetsError(0, "invalid");
  }

  if (startRow > API_LAST_DATA_ROW) {
    throw new WorksheetTooLargeError();
  }

  return startRow;
}

function apiWorksheetRange(title: string) {
  const lastColumn = columnName(API_COLUMN_LIMIT + 1);
  const lastRow = API_DATA_ROW_LIMIT + 2;

  return `'${quotedSheetTitle(title)}'!A1:${lastColumn}${lastRow}`;
}

function quotedSheetTitle(title: string) {
  return title.replaceAll("'", "''");
}

function columnName(index: number) {
  let current = index;
  let name = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

function uniqueHeaders(cells: string[]) {
  const seen = new Map<string, number>();

  return cells.map((cell, index) => {
    const base = cell.trim() || `Column ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);

    return count === 1 ? base : `${base} ${count}`;
  });
}

function cellToString(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.length > MAX_CELL_LENGTH
    ? value.slice(0, MAX_CELL_LENGTH)
    : value;
}

function readValueRows(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    throw new GoogleSheetsError(0, "unavailable");
  }

  const values = (payload as { values?: unknown }).values;

  if (values == null) {
    return [];
  }

  if (!Array.isArray(values)) {
    throw new GoogleSheetsError(0, "unavailable");
  }

  return values.map((row) => {
    if (!Array.isArray(row)) {
      throw new GoogleSheetsError(0, "unavailable");
    }

    return row.map((cell) => {
      if (typeof cell === "string") {
        return cell;
      }

      if (typeof cell === "number" && Number.isFinite(cell)) {
        return String(cell);
      }

      if (typeof cell === "boolean") {
        return cell ? "TRUE" : "FALSE";
      }

      return "";
    });
  });
}

function parseSpreadsheetWorksheets(
  payload: unknown,
  spreadsheetId: string,
): SpreadsheetWorksheets | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as {
    spreadsheetId?: unknown;
    properties?: unknown;
    sheets?: unknown;
  };

  if (record.spreadsheetId !== spreadsheetId) {
    return null;
  }

  const properties =
    typeof record.properties === "object" && record.properties !== null
      ? (record.properties as { title?: unknown })
      : null;
  const title = properties?.title;
  const name =
    typeof title === "string" &&
    title.trim().length > 0 &&
    title.length <= MAX_NAME_LENGTH
      ? title.trim()
      : "Untitled spreadsheet";
  const sheets = Array.isArray(record.sheets) ? record.sheets : [];

  if (sheets.length > MAX_SHEETS) {
    return null;
  }

  const parsed: Array<WorksheetSummary & { index: number }> = [];

  for (const sheet of sheets) {
    const worksheet = parseWorksheet(sheet);

    if (!worksheet) {
      return null;
    }

    parsed.push(worksheet);
  }

  parsed.sort((left, right) => left.index - right.index);

  return {
    id: spreadsheetId,
    name,
    sheets: parsed.map(({ id, title: sheetTitle }) => ({
      id,
      title: sheetTitle,
    })),
  };
}

function parseWorksheet(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const properties = (value as { properties?: unknown }).properties;

  if (typeof properties !== "object" || properties === null) {
    return null;
  }

  const record = properties as {
    sheetId?: unknown;
    title?: unknown;
    index?: unknown;
  };

  if (
    typeof record.sheetId !== "number" ||
    !Number.isSafeInteger(record.sheetId) ||
    record.sheetId < 0 ||
    record.sheetId > MAX_SHEET_ID ||
    typeof record.title !== "string" ||
    record.title.trim().length === 0 ||
    record.title.length > MAX_TITLE_LENGTH ||
    typeof record.index !== "number" ||
    !Number.isSafeInteger(record.index) ||
    record.index < 0
  ) {
    return null;
  }

  return {
    id: record.sheetId,
    title: record.title,
    index: record.index,
  };
}

async function fetchSheets(
  accessToken: string,
  url: URL,
  init?: {
    method?: string;
    body?: string;
  },
) {
  let response: Response;
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  if (init?.body != null) {
    headers["Content-Type"] = "application/json";
  }

  try {
    response = await fetch(url, {
      method,
      headers,
      body: init?.body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GoogleSheetsError(0, "unavailable");
  }

  if (!response.ok) {
    throw await toSheetsError(response);
  }

  if (response.status === 204) {
    void response.body?.cancel();
    return null;
  }

  const text = await response.text();

  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GoogleSheetsError(0, "unavailable");
  }
}

async function toSheetsError(response: Response) {
  if (response.status === 401) {
    return new GoogleSheetsError(401, "reauth");
  }

  if (response.status === 404) {
    void response.body?.cancel();
    return new GoogleSheetsError(404, "not_found");
  }

  if (response.status === 400) {
    void response.body?.cancel();
    return new GoogleSheetsError(400, "invalid");
  }

  if (response.status === 403) {
    const reason = await readSheetsErrorReason(response);

    if (reason === "accessNotConfigured") {
      return new GoogleSheetsError(403, "not_configured");
    }

    if (reason != null && UNAVAILABLE_REASONS.has(reason)) {
      return new GoogleSheetsError(403, "unavailable");
    }

    if (reason != null && REAUTH_REASONS.has(reason)) {
      return new GoogleSheetsError(403, "reauth");
    }

    return new GoogleSheetsError(403, "not_found");
  }

  void response.body?.cancel();
  return new GoogleSheetsError(response.status, "unavailable");
}

async function readSheetsErrorReason(response: Response) {
  try {
    const payload: unknown = await response.json();

    if (typeof payload !== "object" || payload === null) {
      return null;
    }

    const error = (payload as { error?: unknown }).error;

    if (typeof error !== "object" || error === null) {
      return null;
    }

    const errors = (error as { errors?: unknown }).errors;
    const first = Array.isArray(errors) ? errors[0] : null;

    if (typeof first !== "object" || first === null) {
      return null;
    }

    const reason = (first as { reason?: unknown }).reason;

    if (
      typeof reason !== "string" ||
      reason.length === 0 ||
      reason.length > 64 ||
      !/^[a-zA-Z]+$/.test(reason)
    ) {
      return null;
    }

    return reason;
  } catch {
    return null;
  }
}
