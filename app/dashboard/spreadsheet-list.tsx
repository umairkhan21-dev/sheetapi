"use client";

import { useEffect, useRef, useState } from "react";
import {
  notifySpreadsheetOpened,
  saveSpreadsheetSelection,
  SPREADSHEET_SELECTION_EVENT,
} from "@/app/dashboard/save-spreadsheet-selection";
import { secondaryButtonClass } from "@/app/dashboard/ui";

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
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const selecting = useRef(false);

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
    window.addEventListener(SPREADSHEET_SELECTION_EVENT, loadSpreadsheets);

    return () => {
      controller.abort();
      window.removeEventListener(SPREADSHEET_SELECTION_EVENT, loadSpreadsheets);
    };
  }, []);

  async function handleSelect(spreadsheetId: string) {
    if (selecting.current) {
      return;
    }

    selecting.current = true;
    setSelectingId(spreadsheetId);
    setSelectionError(null);
    setSelectionMessage(null);
    const result = await saveSpreadsheetSelection(spreadsheetId);
    selecting.current = false;
    setSelectingId(null);

    if (!result.ok) {
      setSelectionError(result.message);
      return;
    }

    setSelectionMessage(`Selected ${result.spreadsheet.name}.`);
    notifySpreadsheetOpened(result.spreadsheet);
  }

  return (
    <section aria-labelledby="spreadsheets-heading">
      <h2 id="spreadsheets-heading" className="text-base font-semibold">
        Available spreadsheets
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Spreadsheets SheetAPI can already access. Select one to save it.
      </p>

      {state.status === "loading" ? (
        <p role="status" className="mt-4 text-sm text-slate-600">
          Loading your spreadsheets…
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" && state.spreadsheets.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          No spreadsheets are available to SheetAPI yet. Use Choose
          spreadsheet to grant access to an existing spreadsheet.
        </p>
      ) : null}

      {selectionMessage ? (
        <p role="status" className="mt-4 text-sm text-slate-600">
          {selectionMessage}
        </p>
      ) : null}
      {selectionError ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {selectionError}
        </p>
      ) : null}

      {state.status === "ready" && state.spreadsheets.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {state.spreadsheets.map((spreadsheet) => {
            const modified = spreadsheet.modifiedTime
              ? formatModifiedTime(spreadsheet.modifiedTime)
              : null;

            return (
              <li
                key={spreadsheet.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{spreadsheet.name}</p>
                  {modified ? (
                    <p className="mt-0.5 text-sm text-slate-500">
                      Last modified {modified}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleSelect(spreadsheet.id);
                  }}
                  disabled={selectingId !== null}
                  aria-busy={selectingId === spreadsheet.id}
                  className={`${secondaryButtonClass} w-full shrink-0 sm:w-auto`}
                >
                  {selectingId === spreadsheet.id ? "Selecting…" : "Select"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
