const GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const DRIVE_LIST_QUERY =
  "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
const DRIVE_LIST_FIELDS =
  "nextPageToken,files(id,name,mimeType,modifiedTime,trashed)";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const MAX_PAGE_TOKEN_LENGTH = 2048;

const REAUTH_REASONS = new Set([
  "authError",
  "forbidden",
  "insufficientFilePermissions",
  "insufficientPermissions",
]);

export type SpreadsheetSummary = {
  id: string;
  name: string;
  modifiedTime: string | null;
};

export class GoogleDriveError extends Error {
  readonly httpStatus: number;
  readonly reauthRequired: boolean;

  constructor(httpStatus: number, reauthRequired: boolean) {
    super("Google Drive request failed");
    this.name = "GoogleDriveError";
    this.httpStatus = httpStatus;
    this.reauthRequired = reauthRequired;
  }
}

export function parseDriveFilesPage(payload: unknown): {
  spreadsheets: SpreadsheetSummary[];
  nextPageToken: string | null;
} {
  if (typeof payload !== "object" || payload === null) {
    throw new GoogleDriveError(0, false);
  }

  const record = payload as Record<string, unknown>;
  const files = record.files ?? [];

  if (!Array.isArray(files)) {
    throw new GoogleDriveError(0, false);
  }

  const spreadsheets: SpreadsheetSummary[] = [];

  for (const file of files) {
    const spreadsheet = toSpreadsheetSummary(file);

    if (spreadsheet) {
      spreadsheets.push(spreadsheet);
    }
  }

  return {
    spreadsheets,
    nextPageToken: readPageToken(record.nextPageToken),
  };
}

export async function listGoogleSpreadsheets(
  accessToken: string,
): Promise<SpreadsheetSummary[]> {
  const spreadsheets: SpreadsheetSummary[] = [];
  const seenIds = new Set<string>();
  const seenPageTokens = new Set<string>();
  let pageToken: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(GOOGLE_DRIVE_FILES_URL);
    url.searchParams.set("q", DRIVE_LIST_QUERY);
    url.searchParams.set("fields", DRIVE_LIST_FIELDS);
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("spaces", "drive");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GoogleDriveError(0, false);
    }

    if (!response.ok) {
      throw await toDriveError(response);
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new GoogleDriveError(0, false);
    }

    const parsed = parseDriveFilesPage(payload);

    for (const spreadsheet of parsed.spreadsheets) {
      if (seenIds.has(spreadsheet.id)) {
        continue;
      }

      seenIds.add(spreadsheet.id);
      spreadsheets.push(spreadsheet);
    }

    if (!parsed.nextPageToken || seenPageTokens.has(parsed.nextPageToken)) {
      break;
    }

    seenPageTokens.add(parsed.nextPageToken);
    pageToken = parsed.nextPageToken;
  }

  return spreadsheets;
}

function toSpreadsheetSummary(file: unknown): SpreadsheetSummary | null {
  if (typeof file !== "object" || file === null) {
    return null;
  }

  const record = file as Record<string, unknown>;

  if (record.trashed === true) {
    return null;
  }

  if (record.mimeType !== SPREADSHEET_MIME_TYPE) {
    return null;
  }

  if (!isFileId(record.id) || !isFileName(record.name)) {
    return null;
  }

  return {
    id: record.id,
    name: record.name.trim(),
    modifiedTime: readModifiedTime(record.modifiedTime),
  };
}

function isFileId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\s\u0000-\u001f]/.test(value)
  );
}

function isFileName(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const name = value.trim();

  return name.length > 0 && name.length <= 1024;
}

function readModifiedTime(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return null;
  }

  const time = Date.parse(value);

  if (!Number.isFinite(time)) {
    return null;
  }

  return value;
}

function readPageToken(value: unknown) {
  if (value == null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_PAGE_TOKEN_LENGTH
  ) {
    throw new GoogleDriveError(0, false);
  }

  return value;
}

async function toDriveError(response: Response) {
  if (response.status === 401) {
    return new GoogleDriveError(401, true);
  }

  if (response.status === 403) {
    const reason = await readDriveErrorReason(response);
    return new GoogleDriveError(403, reason == null || REAUTH_REASONS.has(reason));
  }

  void response.body?.cancel();
  return new GoogleDriveError(response.status, false);
}

async function readDriveErrorReason(response: Response) {
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
