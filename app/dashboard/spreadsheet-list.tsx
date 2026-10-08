"use client";

import { useEffect, useState } from "react";

type SpreadsheetSummary = {
  id: string;
  name: string;
  modifiedTime: string | null;
};

type ListState =
  | { status: "loading" }
  | { status: "ready"; spreadsheets: SpreadsheetSummary[] }
  | { status: "error"; message: string };

function readSpreadsheets(payload: unknown) {
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

  const spreadsheets: SpreadsheetSummary[] = [];

  for (const item of record.spreadsheets) {
    if (typeof item !== "object" || item === null) {
      return null;
    }

    const spreadsheet = item as Record<string, unknown>;

    if (
      typeof spreadsheet.id !== "string" ||
      typeof spreadsheet.name !== "string"
    ) {
      return null;
    }

    const modifiedTime = spreadsheet.modifiedTime;

    spreadsheets.push({
      id: spreadsheet.id,
      name: spreadsheet.name,
      modifiedTime: typeof modifiedTime === "string" ? modifiedTime : null,
    });
  }

  return spreadsheets;
}

function readErrorMessage(payload: unknown) {
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

function formatModifiedTime(value: string) {
  const time = Date.parse(value);

  if (!Number.isFinite(time)) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(time);
}

export function SpreadsheetList() {
  const [state, setState] = useState<ListState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadSpreadsheets() {
      try {
        const response = await fetch("/api/google/sheets", {
          credentials: "same-origin",
          signal: controller.signal,
        });
        let payload: unknown = null;

        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (controller.signal.aborted) {
          return;
        }

        const spreadsheets = readSpreadsheets(payload);

        if (response.ok && spreadsheets) {
          setState({ status: "ready", spreadsheets });
          return;
        }

        setState({
          status: "error",
          message:
            readErrorMessage(payload) ??
            "Spreadsheets could not be loaded. Try again.",
        });
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          message:
            "Spreadsheets could not be loaded. Check your connection and try again.",
        });
      }
    }

    void loadSpreadsheets();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <section className="mt-8" aria-labelledby="spreadsheets-heading">
      <h2 id="spreadsheets-heading" className="font-medium">
        Your spreadsheets
      </h2>

      {state.status === "loading" ? (
        <p role="status" className="mt-4 text-sm text-zinc-600">
          Loading your spreadsheets…
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" && state.spreadsheets.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No spreadsheets are available to SheetAPI yet. The current Google
          permission only includes spreadsheets created or opened with this
          app. Choosing an existing spreadsheet needs a file-selection step
          such as Google Picker.
        </p>
      ) : null}

      {state.status === "ready" && state.spreadsheets.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {state.spreadsheets.map((spreadsheet) => {
            const modified = spreadsheet.modifiedTime
              ? formatModifiedTime(spreadsheet.modifiedTime)
              : null;

            return (
              <li
                key={spreadsheet.id}
                className="rounded-lg border border-zinc-200 p-4"
              >
                <p className="font-medium">{spreadsheet.name}</p>
                {modified ? (
                  <p className="mt-1 text-sm text-zinc-500">
                    Last modified {modified}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="mt-3 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
                >
                  Select
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
