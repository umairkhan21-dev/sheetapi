"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DisconnectSpreadsheetButton } from "@/app/dashboard/disconnect-spreadsheet-button";
import { SpreadsheetPreview } from "@/app/dashboard/spreadsheet-preview";
import {
  notifySpreadsheetOpened,
  readErrorMessage,
  readSpreadsheetList,
  saveSpreadsheetSelection,
  SPREADSHEET_OPEN_EVENT,
  SPREADSHEET_SELECTION_EVENT,
  type SavedSpreadsheet,
} from "@/app/dashboard/save-spreadsheet-selection";
import { primaryButtonClass, secondaryButtonClass } from "@/app/dashboard/ui";

type PickerStatus =
  | { tone: "idle" }
  | { tone: "loading"; message: string }
  | { tone: "info"; message: string }
  | { tone: "error"; message: string };

type ChosenState =
  | { status: "loading" }
  | { status: "ready"; spreadsheets: SavedSpreadsheet[] }
  | { status: "error"; message: string };

type PickerSession = {
  developerKey: string;
  appId: string;
  accessToken: string;
};

const PICKER_SCRIPT_URL = "https://apis.google.com/js/api.js";
const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

let pickerApiPromise: Promise<void> | null = null;

export function SpreadsheetPicker() {
  const opening = useRef(false);
  const [status, setStatus] = useState<PickerStatus>({ tone: "idle" });
  const [chosen, setChosen] = useState<ChosenState>({ status: "loading" });
  const [openSpreadsheet, setOpenSpreadsheet] =
    useState<SavedSpreadsheet | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadChosen() {
      try {
        const response = await fetch("/api/google/sheets/selection", {
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

        const spreadsheets = readSpreadsheetList(payload);

        if (response.ok && spreadsheets) {
          setChosen({ status: "ready", spreadsheets });
          return;
        }

        setChosen({
          status: "error",
          message:
            readErrorMessage(payload) ??
            "Chosen spreadsheets could not be loaded. Try again.",
        });
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setChosen({
          status: "error",
          message:
            "Chosen spreadsheets could not be loaded. Check your connection and try again.",
        });
      }
    }

    function openSavedSpreadsheet(event: Event) {
      const spreadsheet = (event as CustomEvent<SavedSpreadsheet>).detail;

      if (
        !spreadsheet ||
        typeof spreadsheet.id !== "string" ||
        typeof spreadsheet.name !== "string"
      ) {
        return;
      }

      setOpenSpreadsheet({
        id: spreadsheet.id,
        name: spreadsheet.name,
        modifiedTime:
          typeof spreadsheet.modifiedTime === "string"
            ? spreadsheet.modifiedTime
            : null,
      });
    }

    void loadChosen();
    window.addEventListener(SPREADSHEET_SELECTION_EVENT, loadChosen);
    window.addEventListener(SPREADSHEET_OPEN_EVENT, openSavedSpreadsheet);

    return () => {
      controller.abort();
      window.removeEventListener(SPREADSHEET_SELECTION_EVENT, loadChosen);
      window.removeEventListener(SPREADSHEET_OPEN_EVENT, openSavedSpreadsheet);
    };
  }, []);

  async function handleChoose() {
    if (opening.current) {
      return;
    }

    opening.current = true;
    setStatus({ tone: "loading", message: "Opening Google Picker…" });

    try {
      const session = await loadPickerSession();
      await loadPickerApi();
      openPicker(session, {
        onCancel: () => {
          setStatus({
            tone: "info",
            message: "Spreadsheet selection was cancelled.",
          });
        },
        onError: (message) => {
          setStatus({ tone: "error", message });
        },
        onPicked: async (spreadsheetId) => {
          setStatus({ tone: "loading", message: "Checking spreadsheet access…" });
          const result = await saveSpreadsheetSelection(spreadsheetId);

          if (!result.ok) {
            setStatus({ tone: "error", message: result.message });
            return;
          }

          setStatus({
            tone: "info",
            message: `Selected ${result.spreadsheet.name}.`,
          });
          notifySpreadsheetOpened(result.spreadsheet);
        },
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Google Picker could not be opened. Try again.",
      });
    } finally {
      opening.current = false;
    }
  }

  return (
    <section aria-labelledby="saved-spreadsheets-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="saved-spreadsheets-heading" className="text-base font-semibold">
            Saved spreadsheets
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Open a saved spreadsheet to preview its worksheets.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleChoose();
          }}
          disabled={status.tone === "loading"}
          aria-busy={status.tone === "loading"}
          className={`${primaryButtonClass} w-full shrink-0 sm:w-auto`}
        >
          {status.tone === "loading" ? "Please wait…" : "Choose spreadsheet"}
        </button>
      </div>
      {status.tone === "loading" || status.tone === "info" ? (
        <p role="status" className="mt-3 text-sm text-zinc-600">
          {status.message}
        </p>
      ) : null}
      {status.tone === "error" ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {status.message}
        </p>
      ) : null}

      {chosen.status === "loading" ? (
        <p role="status" className="mt-4 text-sm text-zinc-600">
          Loading chosen spreadsheets…
        </p>
      ) : null}
      {chosen.status === "error" ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {chosen.message}
        </p>
      ) : null}
      {chosen.status === "ready" && chosen.spreadsheets.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No spreadsheet has been chosen yet.
        </p>
      ) : null}
      {chosen.status === "ready" && chosen.spreadsheets.length > 0 ? (
        <ul className="mt-4 divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {chosen.spreadsheets.map((spreadsheet) => {
            const opened = openSpreadsheet?.id === spreadsheet.id;

            return (
              <li
                key={spreadsheet.id}
                className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  opened ? "bg-blue-50" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{spreadsheet.name}</p>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {formatModifiedTime(spreadsheet.modifiedTime) ??
                      "Modified time unavailable"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenSpreadsheet(spreadsheet);
                    }}
                    aria-current={opened ? "true" : undefined}
                    className={`${secondaryButtonClass} w-full sm:w-auto`}
                  >
                    {opened ? "Opened" : "Open"}
                  </button>
                  <Link
                    href={`/dashboard/apis/new?spreadsheet=${encodeURIComponent(spreadsheet.id)}`}
                    className={`${secondaryButtonClass} w-full sm:w-auto`}
                  >
                    Create API
                  </Link>
                  <DisconnectSpreadsheetButton
                    spreadsheetId={spreadsheet.id}
                    spreadsheetName={spreadsheet.name}
                    disabled={status.tone === "loading"}
                    onDisconnected={(message) => {
                      setStatus({ tone: "info", message });
                      setOpenSpreadsheet((current) =>
                        current?.id === spreadsheet.id ? null : current,
                      );
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {openSpreadsheet ? (
        <SpreadsheetPreview
          spreadsheetId={openSpreadsheet.id}
          spreadsheetName={openSpreadsheet.name}
        />
      ) : null}
    </section>
  );
}

async function loadPickerSession(): Promise<PickerSession> {
  const response = await fetch("/api/google/picker", {
    credentials: "same-origin",
    cache: "no-store",
  });
  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const session = readPickerSession(payload);

  if (!response.ok || !session) {
    throw new Error(
      readErrorMessage(payload) ?? "Google Picker could not be opened. Try again.",
    );
  }

  return session;
}

function readPickerSession(payload: unknown): PickerSession | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as { success?: unknown; picker?: unknown };

  if (record.success !== true || typeof record.picker !== "object" || record.picker === null) {
    return null;
  }

  const picker = record.picker as Record<string, unknown>;

  if (
    typeof picker.developerKey !== "string" ||
    typeof picker.appId !== "string" ||
    typeof picker.accessToken !== "string" ||
    picker.developerKey.length === 0 ||
    picker.appId.length === 0 ||
    picker.accessToken.length === 0
  ) {
    return null;
  }

  return {
    developerKey: picker.developerKey,
    appId: picker.appId,
    accessToken: picker.accessToken,
  };
}

function loadPickerApi() {
  if (window.google?.picker?.PickerBuilder) {
    return Promise.resolve();
  }

  if (!pickerApiPromise) {
    pickerApiPromise = new Promise((resolve, reject) => {
      const fail = () => {
        pickerApiPromise = null;
        reject(new Error("Google Picker could not be loaded. Try again."));
      };
      const start = () => {
        if (!window.gapi?.load) {
          fail();
          return;
        }

        window.gapi.load("picker", {
          callback: () => {
            if (window.google?.picker?.PickerBuilder) {
              resolve();
              return;
            }

            fail();
          },
          onerror: fail,
          timeout: 15000,
          ontimeout: fail,
        });
      };

      if (window.gapi?.load) {
        start();
        return;
      }

      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${PICKER_SCRIPT_URL}"]`,
      );

      if (existing) {
        existing.addEventListener("load", start, { once: true });
        existing.addEventListener("error", fail, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = PICKER_SCRIPT_URL;
      script.async = true;
      script.onload = start;
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }

  return pickerApiPromise;
}

function openPicker(
  session: PickerSession,
  handlers: {
    onCancel: () => void;
    onError: (message: string) => void;
    onPicked: (spreadsheetId: string) => Promise<void>;
  },
) {
  const pickerApi = window.google?.picker;

  if (!pickerApi) {
    handlers.onError("Google Picker could not be loaded. Try again.");
    return;
  }

  const view = new pickerApi.DocsView(pickerApi.ViewId.SPREADSHEETS)
    .setMimeTypes(SPREADSHEET_MIME_TYPE)
    .setMode(pickerApi.DocsViewMode.LIST);
  const builder = new pickerApi.PickerBuilder()
    .addView(view)
    .setOAuthToken(session.accessToken)
    .setDeveloperKey(session.developerKey)
    .setAppId(session.appId)
    .setOrigin(window.location.origin)
    .setTitle("Choose a spreadsheet")
    .setCallback((data) => {
      const action = data[pickerApi.Response.ACTION];

      if (action === pickerApi.Action.CANCEL) {
        handlers.onCancel();
        return;
      }

      if (action !== pickerApi.Action.PICKED) {
        return;
      }

      const documents = data[pickerApi.Response.DOCUMENTS];
      const first = Array.isArray(documents) ? documents[0] : undefined;
      const spreadsheetId = first?.[pickerApi.Document.ID];

      if (typeof spreadsheetId !== "string" || spreadsheetId.length === 0) {
        handlers.onError("Spreadsheet selection could not be read. Try again.");
        return;
      }

      void handlers.onPicked(spreadsheetId);
    });

  if (pickerApi.Feature?.NAV_HIDDEN) {
    builder.enableFeature(pickerApi.Feature.NAV_HIDDEN);
  }

  builder.build().setVisible(true);
}

function formatModifiedTime(value: string | null) {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);

  if (!Number.isFinite(time)) {
    return null;
  }

  return `Last modified ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(time)}`;
}

type PickerDocument = {
  [key: string]: string | undefined;
};

type PickerResponse = {
  [key: string]: string | PickerDocument[] | undefined;
};

type DocsView = {
  setMimeTypes(mimeTypes: string): DocsView;
  setMode(mode: string): DocsView;
};

type PickerBuilder = {
  addView(view: DocsView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setCallback(callback: (data: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
};

declare global {
  interface Window {
    gapi?: {
      load: (
        api: string,
        options: {
          callback: () => void;
          onerror?: () => void;
          timeout?: number;
          ontimeout?: () => void;
        },
      ) => void;
    };
    google?: {
      picker?: {
        PickerBuilder: new () => PickerBuilder;
        DocsView: new (viewId: string) => DocsView;
        ViewId: { SPREADSHEETS: string };
        DocsViewMode: { LIST: string };
        Feature?: { NAV_HIDDEN?: string };
        Action: { PICKED: string; CANCEL: string };
        Response: { ACTION: string; DOCUMENTS: string };
        Document: { ID: string };
      };
    };
  }
}
