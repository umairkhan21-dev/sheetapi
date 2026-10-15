export type SavedSpreadsheet = {
  id: string;
  name: string;
  modifiedTime: string | null;
};

export const SPREADSHEET_SELECTION_EVENT = "sheetapi-spreadsheet-selected";
export const SPREADSHEET_OPEN_EVENT = "sheetapi-spreadsheet-open";

export function notifySpreadsheetSelected() {
  window.dispatchEvent(new Event(SPREADSHEET_SELECTION_EVENT));
}

export function notifySpreadsheetOpened(spreadsheet: SavedSpreadsheet) {
  window.dispatchEvent(
    new CustomEvent<SavedSpreadsheet>(SPREADSHEET_OPEN_EVENT, {
      detail: spreadsheet,
    }),
  );
}

export async function saveSpreadsheetSelection(
  spreadsheetId: string,
): Promise<
  { ok: true; spreadsheet: SavedSpreadsheet } | { ok: false; message: string }
> {
  try {
    const response = await fetch("/api/google/sheets/selection", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spreadsheetId }),
    });
    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const spreadsheet = readSpreadsheet(payload);

    if (response.ok && spreadsheet) {
      notifySpreadsheetSelected();
      return { ok: true, spreadsheet };
    }

    return {
      ok: false,
      message:
        readErrorMessage(payload) ??
        "The spreadsheet could not be selected. Try again.",
    };
  } catch {
    return {
      ok: false,
      message:
        "The spreadsheet could not be selected. Check your connection and try again.",
    };
  }
}

export function readSpreadsheet(payload: unknown): SavedSpreadsheet | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as {
    success?: unknown;
    spreadsheet?: unknown;
  };

  if (record.success !== true) {
    return null;
  }

  return toSpreadsheet(record.spreadsheet);
}

export function readSpreadsheetList(payload: unknown): SavedSpreadsheet[] | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as {
    success?: unknown;
    spreadsheets?: unknown;
  };

  if (record.success !== true || !Array.isArray(record.spreadsheets)) {
    return null;
  }

  const spreadsheets: SavedSpreadsheet[] = [];

  for (const item of record.spreadsheets) {
    const spreadsheet = toSpreadsheet(item);

    if (!spreadsheet) {
      return null;
    }

    spreadsheets.push(spreadsheet);
  }

  return spreadsheets;
}

export function readErrorMessage(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const error = (payload as { error?: unknown }).error;

  if (typeof error !== "object" || error === null) {
    return null;
  }

  const message = (error as { message?: unknown }).message;

  if (typeof message !== "string" || message.trim().length === 0) {
    return null;
  }

  return message;
}

function toSpreadsheet(value: unknown): SavedSpreadsheet | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const spreadsheet = value as Record<string, unknown>;

  if (
    typeof spreadsheet.id !== "string" ||
    typeof spreadsheet.name !== "string"
  ) {
    return null;
  }

  const modifiedTime = spreadsheet.modifiedTime;

  return {
    id: spreadsheet.id,
    name: spreadsheet.name,
    modifiedTime: typeof modifiedTime === "string" ? modifiedTime : null,
  };
}
