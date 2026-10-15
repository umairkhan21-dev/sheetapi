"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { API_CREATED_EVENT } from "@/app/dashboard/api-created";
import {
  readErrorMessage,
  readSpreadsheetList,
  SPREADSHEET_OPEN_EVENT,
  SPREADSHEET_SELECTION_EVENT,
  type SavedSpreadsheet,
} from "@/app/dashboard/save-spreadsheet-selection";
import {
  fieldClass,
  labelClass,
  primaryButtonClass,
} from "@/app/dashboard/ui";

type Worksheet = {
  id: number;
  title: string;
};

type CreatedApi = {
  id: number;
  name: string;
  slug: string;
  spreadsheetName: string;
  worksheetName: string;
  status: "ACTIVE" | "DISABLED";
  url: string;
  createdAt: string;
};

type SpreadsheetState =
  | { status: "loading" }
  | { status: "ready"; spreadsheets: SavedSpreadsheet[] }
  | { status: "error"; message: string };

type WorksheetState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; sheets: Worksheet[] }
  | { status: "error"; message: string };

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string }
  | { status: "success"; api: CreatedApi };

export function CreateApiForm({
  embedded = false,
  initialSpreadsheetId = "",
}: {
  embedded?: boolean;
  initialSpreadsheetId?: string;
}) {
  const requestId = useRef(0);
  const submitting = useRef(false);
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetState>({
    status: "loading",
  });
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [worksheets, setWorksheets] = useState<WorksheetState>({
    status: "idle",
  });
  const [worksheetId, setWorksheetId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadSpreadsheets() {
      const currentRequest = ++requestId.current;

      try {
        const response = await fetch("/api/google/sheets/selection", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        let payload: unknown = null;

        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (controller.signal.aborted || currentRequest !== requestId.current) {
          return;
        }

        const saved = readSpreadsheetList(payload);

        if (response.ok && saved) {
          setSpreadsheets({ status: "ready", spreadsheets: saved });
          setSpreadsheetId((current) => {
            if (current && saved.some((item) => item.id === current)) {
              return current;
            }

            if (
              initialSpreadsheetId &&
              saved.some((item) => item.id === initialSpreadsheetId)
            ) {
              return initialSpreadsheetId;
            }

            return "";
          });
          return;
        }

        setSpreadsheets({
          status: "error",
          message:
            readErrorMessage(payload) ??
            "Saved spreadsheets could not be loaded. Try again.",
        });
      } catch {
        if (controller.signal.aborted || currentRequest !== requestId.current) {
          return;
        }

        setSpreadsheets({
          status: "error",
          message:
            "Saved spreadsheets could not be loaded. Check your connection and try again.",
        });
      }
    }

    void loadSpreadsheets();
    window.addEventListener(SPREADSHEET_SELECTION_EVENT, loadSpreadsheets);

    function openSavedSpreadsheet(event: Event) {
      const detail = (event as CustomEvent<SavedSpreadsheet>).detail;

      if (!detail?.id || typeof detail.name !== "string") {
        return;
      }

      setSpreadsheets((current) => {
        if (current.status !== "ready") {
          return {
            status: "ready",
            spreadsheets: [detail],
          };
        }

        if (current.spreadsheets.some((item) => item.id === detail.id)) {
          return current;
        }

        return {
          status: "ready",
          spreadsheets: [detail, ...current.spreadsheets],
        };
      });
      setSpreadsheetId(detail.id);
    }

    window.addEventListener(SPREADSHEET_OPEN_EVENT, openSavedSpreadsheet);

    return () => {
      controller.abort();
      window.removeEventListener(SPREADSHEET_SELECTION_EVENT, loadSpreadsheets);
      window.removeEventListener(SPREADSHEET_OPEN_EVENT, openSavedSpreadsheet);
    };
  }, [initialSpreadsheetId]);

  useEffect(() => {
    if (!spreadsheetId) {
      return;
    }

    const controller = new AbortController();

    async function loadWorksheets() {
      setWorksheets({ status: "loading" });
      setWorksheetId("");

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

        const sheets = readWorksheets(payload);

        if (response.ok && sheets) {
          setWorksheets({ status: "ready", sheets });
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
  }, [spreadsheetId]);

  function clearSubmitError() {
    setSubmitState((current) =>
      current.status === "error" ? { status: "idle" } : current,
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) {
      return;
    }

    const trimmedName = name.trim();

    if (!spreadsheetId) {
      setSubmitState({
        status: "error",
        message: "Choose a spreadsheet.",
      });
      return;
    }

    if (!worksheetId) {
      setSubmitState({
        status: "error",
        message: "Choose a worksheet.",
      });
      return;
    }

    if (!trimmedName) {
      setSubmitState({
        status: "error",
        message: "Enter an API name.",
      });
      return;
    }

    submitting.current = true;
    setSubmitState({ status: "submitting" });

    try {
      const response = await fetch("/api/apis", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          slug: slug.trim(),
          spreadsheetId,
          worksheetId: Number(worksheetId),
        }),
      });
      let payload: unknown = null;

      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const created = readCreatedApi(payload);

      if (response.ok && created) {
        setName("");
        setSlug("");
        setSubmitState({ status: "success", api: created });
        window.dispatchEvent(
          new CustomEvent(API_CREATED_EVENT, {
            detail: {
              id: created.id,
              name: created.name,
              slug: created.slug,
              worksheetName: created.worksheetName,
              status: created.status,
              url: created.url,
              createdAt: created.createdAt,
            },
          }),
        );
        return;
      }

      setSubmitState({
        status: "error",
        message:
          readErrorMessage(payload) ??
          "The API could not be created. Try again.",
      });
    } catch {
      setSubmitState({
        status: "error",
        message:
          "The API could not be created. Check your connection and try again.",
      });
    } finally {
      submitting.current = false;
    }
  }

  return (
    <section
      aria-labelledby={embedded ? undefined : "create-api-heading"}
      aria-label={embedded ? "Create API" : undefined}
    >
      {embedded ? null : (
        <>
          <h2 id="create-api-heading" className="text-base font-semibold">
            Create API
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Turn one saved worksheet into a read-only JSON endpoint.
          </p>
        </>
      )}

      {spreadsheets.status === "loading" ? (
        <p role="status" className="mt-4 text-sm text-zinc-600">
          Loading saved spreadsheets…
        </p>
      ) : null}

      {spreadsheets.status === "error" ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {spreadsheets.message}
        </p>
      ) : null}

      {spreadsheets.status === "ready" && spreadsheets.spreadsheets.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          Choose a spreadsheet before creating an API.
        </p>
      ) : null}

      {submitState.status === "success" ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900"
        >
          <p className="font-medium">{submitState.api.name} is ready.</p>
          <p className="mt-2">Spreadsheet: {submitState.api.spreadsheetName}</p>
          <p className="mt-1">Worksheet: {submitState.api.worksheetName}</p>
          <p className="mt-2 break-all">
            API URL:{" "}
            <a
              href={submitState.api.url}
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              {submitState.api.url}
            </a>
          </p>
          <Link
            href={`/dashboard/apis/${submitState.api.id}`}
            className={`${primaryButtonClass} mt-4`}
          >
            View API and create a key
          </Link>
        </div>
      ) : null}

      {spreadsheets.status === "ready" && spreadsheets.spreadsheets.length > 0 ? (
        <form className="mt-4 max-w-xl space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div>
            <label htmlFor="api-spreadsheet" className={labelClass}>
              Spreadsheet
            </label>
            <select
              id="api-spreadsheet"
              value={spreadsheetId}
              onChange={(event) => {
                setSpreadsheetId(event.target.value);
                clearSubmitError();
              }}
              required
              className={`${fieldClass} mt-1.5`}
            >
              <option value="">Select a spreadsheet</option>
              {spreadsheets.spreadsheets.map((spreadsheet) => (
                <option key={spreadsheet.id} value={spreadsheet.id}>
                  {spreadsheet.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="api-worksheet" className={labelClass}>
              Worksheet
            </label>
            <select
              id="api-worksheet"
              value={worksheetId}
              onChange={(event) => {
                setWorksheetId(event.target.value);
                clearSubmitError();
              }}
              required
              disabled={!spreadsheetId || worksheets.status === "loading"}
              className={`${fieldClass} mt-1.5`}
            >
              <option value="">
                {worksheets.status === "loading"
                  ? "Loading worksheets…"
                  : "Select a worksheet"}
              </option>
              {worksheets.status === "ready"
                ? worksheets.sheets.map((sheet) => (
                    <option key={sheet.id} value={String(sheet.id)}>
                      {sheet.title}
                    </option>
                  ))
                : null}
            </select>
            {worksheets.status === "error" ? (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {worksheets.message}
              </p>
            ) : null}
            {worksheets.status === "ready" && worksheets.sheets.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">
                This spreadsheet has no worksheets.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="api-name" className={labelClass}>
              API name
            </label>
            <input
              id="api-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                clearSubmitError();
              }}
              maxLength={80}
              required
              autoComplete="off"
              placeholder="Products API"
              className={`${fieldClass} mt-1.5`}
            />
          </div>

          <div>
            <label htmlFor="api-slug" className={labelClass}>
              Endpoint slug
            </label>
            <input
              id="api-slug"
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                clearSubmitError();
              }}
              maxLength={64}
              autoComplete="off"
              placeholder="products"
              spellCheck={false}
              className={`${fieldClass} mt-1.5`}
            />
            <p className="mt-1.5 text-sm text-zinc-500">
              Optional. Leave blank to create one from the name.
            </p>
          </div>

          {submitState.status === "error" ? (
            <p role="alert" className="text-sm text-red-700">
              {submitState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitState.status === "submitting"}
            aria-busy={submitState.status === "submitting"}
            className={primaryButtonClass}
          >
            {submitState.status === "submitting" ? "Creating API…" : "Create API"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function readWorksheets(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const sheets = (payload as { success?: unknown; sheets?: unknown }).sheets;

  if (
    (payload as { success?: unknown }).success !== true ||
    !Array.isArray(sheets)
  ) {
    return null;
  }

  const parsed: Worksheet[] = [];

  for (const item of sheets) {
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

    parsed.push({ id: sheet.id, title: sheet.title });
  }

  return parsed;
}

function readCreatedApi(payload: unknown): CreatedApi | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as { success?: unknown; api?: unknown };

  if (record.success !== true || typeof record.api !== "object" || record.api === null) {
    return null;
  }

  const api = record.api as Record<string, unknown>;

  if (
    typeof api.id !== "number" ||
    !Number.isSafeInteger(api.id) ||
    typeof api.name !== "string" ||
    typeof api.slug !== "string" ||
    typeof api.spreadsheetName !== "string" ||
    typeof api.worksheetName !== "string" ||
    (api.status !== "ACTIVE" && api.status !== "DISABLED") ||
    typeof api.url !== "string" ||
    typeof api.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: api.id,
    name: api.name,
    slug: api.slug,
    spreadsheetName: api.spreadsheetName,
    worksheetName: api.worksheetName,
    status: api.status,
    url: api.url,
    createdAt: api.createdAt,
  };
}
