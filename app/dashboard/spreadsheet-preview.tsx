"use client";

import { useEffect, useState } from "react";
import { readErrorMessage } from "@/app/dashboard/save-spreadsheet-selection";

type Worksheet = {
  id: number;
  title: string;
};

type PreviewRow = Record<string, string>;

type Preview = {
  columns: string[];
  rows: PreviewRow[];
  truncated: boolean;
};

type WorksheetsState =
  | { status: "loading" }
  | { status: "ready"; name: string; sheets: Worksheet[] }
  | { status: "error"; message: string };

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: Preview }
  | { status: "error"; message: string };

export function SpreadsheetPreview({
  spreadsheetId,
  spreadsheetName,
  sheetId,
  hideHeading = false,
}: {
  spreadsheetId: string;
  spreadsheetName: string;
  sheetId?: number;
  hideHeading?: boolean;
}) {
  const [worksheets, setWorksheets] = useState<WorksheetsState>({
    status: "loading",
  });
  const [selectedSheetId, setSelectedSheetId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });

  useEffect(() => {
    if (sheetId != null) {
      return;
    }

    document.getElementById("worksheet-preview")?.scrollIntoView({
      block: "nearest",
    });
  }, [spreadsheetId, sheetId]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadWorksheets() {
      setWorksheets({ status: "loading" });
      setSelectedSheetId(null);
      setPreview({ status: "idle" });

      try {
        const response = await fetch(
          `/api/google/sheets/${encodeURIComponent(spreadsheetId)}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        let payload: unknown = null;

        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (controller.signal.aborted) {
          return;
        }

        const parsed = readWorksheets(payload);

        if (response.ok && parsed) {
          if (sheetId != null) {
            const match = parsed.sheets.find((sheet) => sheet.id === sheetId);

            if (!match) {
              setWorksheets({
                status: "error",
                message: "That worksheet was not found.",
              });
              return;
            }

            setWorksheets({
              status: "ready",
              name: parsed.name,
              sheets: [match],
            });
            setSelectedSheetId(match.id);
            return;
          }

          setWorksheets({
            status: "ready",
            name: parsed.name,
            sheets: parsed.sheets,
          });
          setSelectedSheetId(parsed.sheets[0]?.id ?? null);
          return;
        }

        setWorksheets({
          status: "error",
          message:
            readErrorMessage(payload) ??
            "Worksheets could not be loaded. Try again.",
        });
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setWorksheets({
          status: "error",
          message:
            "Worksheets could not be loaded. Check your connection and try again.",
        });
      }
    }

    void loadWorksheets();

    return () => {
      controller.abort();
    };
  }, [spreadsheetId, sheetId]);

  useEffect(() => {
    if (selectedSheetId == null) {
      return;
    }

    const controller = new AbortController();

    async function loadPreview() {
      setPreview({ status: "loading" });

      try {
        const response = await fetch(
          `/api/google/sheets/${encodeURIComponent(spreadsheetId)}/preview?sheetId=${selectedSheetId}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        let payload: unknown = null;

        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (controller.signal.aborted) {
          return;
        }

        const parsed = readPreview(payload);

        if (response.ok && parsed) {
          setPreview({ status: "ready", preview: parsed });
          return;
        }

        setPreview({
          status: "error",
          message:
            readErrorMessage(payload) ??
            "Worksheet data could not be loaded. Try again.",
        });
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setPreview({
          status: "error",
          message:
            "Worksheet data could not be loaded. Check your connection and try again.",
        });
      }
    }

    void loadPreview();

    return () => {
      controller.abort();
    };
  }, [selectedSheetId, spreadsheetId]);

  const displayName =
    worksheets.status === "ready" ? worksheets.name : spreadsheetName;

  return (
    <section
      id="worksheet-preview"
      className={`${hideHeading ? "" : "mt-6"} rounded-lg border border-zinc-200 bg-white p-4`}
      aria-labelledby={hideHeading ? undefined : "worksheet-preview-heading"}
      aria-label={hideHeading ? `${displayName} preview` : undefined}
    >
      {hideHeading ? null : (
        <h3 id="worksheet-preview-heading" className="font-medium">
          {displayName}
        </h3>
      )}

      {worksheets.status === "loading" ? (
        <p role="status" className="mt-3 text-sm text-zinc-600">
          Loading worksheets…
        </p>
      ) : null}

      {worksheets.status === "error" ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {worksheets.message}
        </p>
      ) : null}

      {worksheets.status === "ready" && worksheets.sheets.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600">
          This spreadsheet has no worksheets.
        </p>
      ) : null}

      {worksheets.status === "ready" && sheetId == null && worksheets.sheets.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Worksheets">
          {worksheets.sheets.map((sheet) => {
            const selected = sheet.id === selectedSheetId;

            return (
              <button
                key={sheet.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setSelectedSheetId(sheet.id);
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-zinc-300 bg-white hover:bg-zinc-50"
                }`}
              >
                {sheet.title}
              </button>
            );
          })}
        </div>
      ) : null}

      {worksheets.status === "ready" && sheetId != null && worksheets.sheets[0] ? (
        <p className="mt-3 text-sm text-zinc-600">
          Worksheet: {worksheets.sheets[0].title}
        </p>
      ) : null}

      {preview.status === "loading" ? (
        <p role="status" className="mt-4 text-sm text-zinc-600">
          Loading preview…
        </p>
      ) : null}

      {preview.status === "error" ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {preview.message}
        </p>
      ) : null}

      {preview.status === "ready" && preview.preview.columns.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">This worksheet is empty.</p>
      ) : null}

      {preview.status === "ready" && preview.preview.columns.length > 0 ? (
        <div className="mt-4">
          {preview.preview.rows.length === 0 ? (
            <p className="text-sm text-zinc-600">
              This worksheet has headers and no data rows.
            </p>
          ) : null}
          {preview.preview.truncated ? (
            <p className="text-sm text-zinc-600">
              Preview shows the first 100 rows and 50 columns.
            </p>
          ) : null}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  {preview.preview.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="border-b border-zinc-200 px-3 py-2 font-medium"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview.rows.map((row, index) => (
                  <tr key={index}>
                    {preview.preview.columns.map((column) => (
                      <td
                        key={column}
                        className="border-b border-zinc-100 px-3 py-2 align-top"
                      >
                        {row[column] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-800">
            {JSON.stringify(preview.preview.rows, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function readWorksheets(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as {
    success?: unknown;
    name?: unknown;
    sheets?: unknown;
  };

  if (
    record.success !== true ||
    typeof record.name !== "string" ||
    !Array.isArray(record.sheets)
  ) {
    return null;
  }

  const sheets: Worksheet[] = [];

  for (const item of record.sheets) {
    if (typeof item !== "object" || item === null) {
      return null;
    }

    const sheet = item as { id?: unknown; title?: unknown };

    if (
      typeof sheet.id !== "number" ||
      !Number.isSafeInteger(sheet.id) ||
      typeof sheet.title !== "string" ||
      sheet.title.length === 0
    ) {
      return null;
    }

    sheets.push({ id: sheet.id, title: sheet.title });
  }

  return { name: record.name, sheets };
}

function readPreview(payload: unknown): Preview | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as {
    success?: unknown;
    columns?: unknown;
    rows?: unknown;
    truncated?: unknown;
  };

  if (
    record.success !== true ||
    !Array.isArray(record.columns) ||
    !Array.isArray(record.rows) ||
    typeof record.truncated !== "boolean"
  ) {
    return null;
  }

  const columns: string[] = [];

  for (const column of record.columns) {
    if (typeof column !== "string") {
      return null;
    }

    columns.push(column);
  }

  const rows: PreviewRow[] = [];

  for (const item of record.rows) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return null;
    }

    const row: PreviewRow = {};

    for (const column of columns) {
      const value = (item as Record<string, unknown>)[column];
      row[column] = typeof value === "string" ? value : "";
    }

    rows.push(row);
  }

  return { columns, rows, truncated: record.truncated };
}
