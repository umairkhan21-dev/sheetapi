"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeleteApiButton } from "@/app/dashboard/delete-api-button";
import { readErrorMessage } from "@/app/dashboard/save-spreadsheet-selection";
import { apiReadAvailability } from "@/lib/api-availability";
import {
  apiListColumnsClass,
  Notice,
  PageHeader,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from "@/app/dashboard/ui";

type ApiStatus = "ACTIVE" | "DISABLED";
type PendingAction = "rename" | "status";

type ManagedApi = {
  name: string;
  slug: string;
  status: ApiStatus;
};

type NoticeState = {
  tone: "success" | "error";
  message: string;
};

const rowActionClass =
  "text-sm font-medium text-slate-800 hover:underline disabled:cursor-not-allowed disabled:opacity-60";

export function ApiListRow({
  apiId,
  apiName,
  worksheetName,
  slug,
  status,
  createdLabel,
  spreadsheetSaved,
  googleConnected,
}: {
  apiId: number;
  apiName: string;
  worksheetName: string;
  slug: string;
  status: ApiStatus;
  createdLabel: string;
  spreadsheetSaved: boolean;
  googleConnected: boolean;
}) {
  return (
    <ApiEditor
      apiId={apiId}
      apiName={apiName}
      slug={slug}
      status={status}
      layout="row"
      worksheetName={worksheetName}
      createdLabel={createdLabel}
      spreadsheetSaved={spreadsheetSaved}
      googleConnected={googleConnected}
    />
  );
}

export function ApiDetailSettings({
  apiId,
  apiName,
  status,
  slug,
  spreadsheetSaved,
  googleConnected,
}: {
  apiId: number;
  apiName: string;
  status: ApiStatus;
  slug: string;
  spreadsheetSaved: boolean;
  googleConnected: boolean;
}) {
  return (
    <ApiEditor
      apiId={apiId}
      apiName={apiName}
      slug={slug}
      status={status}
      layout="page"
      spreadsheetSaved={spreadsheetSaved}
      googleConnected={googleConnected}
    />
  );
}

function ApiEditor({
  apiId,
  apiName,
  slug,
  status: initialStatus,
  layout,
  worksheetName,
  createdLabel,
  spreadsheetSaved,
  googleConnected,
}: {
  apiId: number;
  apiName: string;
  slug: string;
  status: ApiStatus;
  layout: "row" | "page";
  worksheetName?: string;
  createdLabel?: string;
  spreadsheetSaved: boolean;
  googleConnected: boolean;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(apiName);
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftName, setDraftName] = useState(apiName);
  const [renameError, setRenameError] = useState<string | null>(null);
  const busy = pending !== null || renameOpen;
  const availability = apiReadAvailability({
    status,
    spreadsheetSaved,
    googleConnected,
  });
  const availabilityLabel = availabilityText(availability);
  const actionClass = layout === "row" ? rowActionClass : secondaryButtonClass;
  const titleId = `rename-api-title-${apiId}`;
  const inputId = `rename-api-name-${apiId}`;

  function openRename() {
    if (submitting.current) {
      return;
    }

    setDraftName(name);
    setRenameError(null);
    setRenameOpen(true);
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => {
        const input = dialog.querySelector("input");

        if (input instanceof HTMLInputElement) {
          input.focus();
        }
      });
    }
  }

  function closeRename() {
    if (submitting.current) {
      return;
    }

    if (dialogRef.current?.open) {
      dialogRef.current.close();
    }

    setRenameOpen(false);
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    await run("rename", { name: draftName }, (api) => {
      return `Renamed to ${api.name}. The endpoint is still /api/v1/${api.slug}.`;
    });
  }

  async function toggleStatus() {
    const nextStatus = status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    await run("status", { status: nextStatus }, (api) => {
      if (api.status === "DISABLED") {
        return "This API is disabled. Requests cannot read the spreadsheet, even with a valid API key.";
      }

      if (!spreadsheetSaved) {
        return "This API is enabled, but its spreadsheet selection is disconnected. Save the spreadsheet again before public reads can return data.";
      }

      if (!googleConnected) {
        return "This API is enabled, but Google Sheets is disconnected. Reconnect Google before public reads can return data.";
      }

      return "This API is enabled. A valid, active API key can read the spreadsheet again.";
    });
  }

  async function run(
    action: PendingAction,
    body: { name?: string; status?: ApiStatus },
    successMessage: (api: ManagedApi) => string,
  ) {
    if (submitting.current) {
      return;
    }

    submitting.current = true;
    setPending(action);
    setNotice(null);

    if (action === "rename") {
      setRenameError(null);
    }

    try {
      const result = await updateApi(apiId, body);

      if (!result.ok) {
        if (action === "rename") {
          setRenameError(result.message);
        } else {
          setNotice({ tone: "error", message: result.message });
        }
        return;
      }

      setName(result.api.name);
      setStatus(result.api.status);
      setDraftName(result.api.name);
      setNotice({ tone: "success", message: successMessage(result.api) });

      if (action === "rename") {
        if (dialogRef.current?.open) {
          dialogRef.current.close();
        }

        setRenameOpen(false);
      }

      router.refresh();
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  const renameButton = (
    <button
      type="button"
      onClick={openRename}
      disabled={busy}
      aria-busy={pending === "rename"}
      className={actionClass}
    >
      {pending === "rename" ? "Saving…" : "Rename"}
    </button>
  );
  const statusButton = (
    <button
      type="button"
      onClick={() => void toggleStatus()}
      disabled={busy}
      aria-busy={pending === "status"}
      className={actionClass}
    >
      {statusButtonLabel(status, pending)}
    </button>
  );
  const dialog = (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[min(100%,28rem)] rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-lg backdrop:bg-slate-900/40"
      onCancel={(event) => {
        if (pending === "rename") {
          event.preventDefault();
        }
      }}
      onClose={() => {
        if (!submitting.current) {
          setRenameOpen(false);
        }
      }}
    >
      <form className="space-y-4 p-4" onSubmit={(event) => void saveName(event)}>
        <h2 id={titleId} className="text-base font-semibold">
          Rename {name}
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          This changes the display name only. The endpoint stays{" "}
          <span className="font-mono text-xs">/api/v1/{slug}</span>. Spreadsheet,
          worksheet, and API keys stay the same.
        </p>
        <div>
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-900">
            API name
          </label>
          <input
            id={inputId}
            value={draftName}
            onChange={(event) => {
              setDraftName(event.target.value);
              setRenameError(null);
            }}
            maxLength={80}
            required
            autoComplete="off"
            disabled={pending === "rename"}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        {renameError ? (
          <p role="alert" className="text-sm text-red-700">
            {renameError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={closeRename}
            disabled={pending === "rename"}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={pending === "rename"}
            aria-busy={pending === "rename"}
          >
            {pending === "rename" ? "Saving…" : "Save name"}
          </button>
        </div>
      </form>
    </dialog>
  );
  const noticeNode = notice ? (
    <Notice tone={notice.tone}>{notice.message}</Notice>
  ) : null;

  if (layout === "page") {
    return (
      <div className="space-y-4">
        <PageHeader
          title={name}
          description="Endpoint, linked worksheet, and API keys."
          action={
            <div className="flex flex-wrap gap-2">
              {renameButton}
              {statusButton}
              <Link href="/dashboard/apis" className={secondaryButtonClass}>
                All APIs
              </Link>
              <DeleteApiButton apiId={apiId} apiName={name} />
            </div>
          }
        />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge tone={availabilityLabel.tone}>
              {availabilityLabel.label}
            </StatusBadge>
          </div>
          {status === "DISABLED" ? (
            <p className="text-sm text-slate-600">
              Public reads are off. A valid API key cannot return spreadsheet
              data until this API is enabled.
            </p>
          ) : null}
          {!spreadsheetSaved ? (
            <p className="text-sm text-slate-600">
              This spreadsheet selection is disconnected. Public reads return
              no spreadsheet data until you save it again.
            </p>
          ) : null}
          {spreadsheetSaved && !googleConnected ? (
            <p className="text-sm text-slate-600">
              Google Sheets is disconnected. Public reads return no spreadsheet
              data until you reconnect.
            </p>
          ) : null}
        </div>
        {noticeNode}
        {dialog}
      </div>
    );
  }

  return (
    <li className="px-4 py-3">
      <div className={`grid gap-2 ${apiListColumnsClass} md:items-center md:gap-3`}>
        <Link
          href={`/dashboard/apis/${apiId}`}
          className="text-sm font-medium text-green-700 hover:underline"
        >
          {name}
        </Link>
        <p className="text-sm text-slate-700">
          <span className="text-slate-500 md:hidden">Worksheet: </span>
          {worksheetName}
        </p>
        <div>
          <StatusBadge tone={availabilityLabel.tone}>
            {availabilityLabel.label}
          </StatusBadge>
        </div>
        <p className="truncate font-mono text-xs text-slate-600">
          <span className="font-sans text-slate-500 md:hidden">Endpoint: </span>
          /api/v1/{slug}
        </p>
        <p className="text-sm text-slate-600">
          <span className="md:hidden">Created </span>
          {createdLabel}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {renameButton}
          {statusButton}
          <DeleteApiButton apiId={apiId} apiName={name} appearance="text" />
        </div>
      </div>
      {notice ? <div className="mt-2">{noticeNode}</div> : null}
      {dialog}
    </li>
  );
}

function availabilityText(availability: ReturnType<typeof apiReadAvailability>) {
  if (availability === "active") {
    return { label: "Active", tone: "success" as const };
  }

  if (availability === "disabled") {
    return { label: "Disabled", tone: "neutral" as const };
  }

  if (availability === "spreadsheet_disconnected") {
    return { label: "Spreadsheet disconnected", tone: "neutral" as const };
  }

  return { label: "Reconnect Google", tone: "neutral" as const };
}

function statusButtonLabel(status: ApiStatus, pending: PendingAction | null) {
  if (pending === "status") {
    return status === "ACTIVE" ? "Disabling…" : "Enabling…";
  }

  return status === "ACTIVE" ? "Disable" : "Enable";
}

async function updateApi(
  apiId: number,
  body: { name?: string; status?: ApiStatus },
): Promise<{ ok: true; api: ManagedApi } | { ok: false; message: string }> {
  try {
    const response = await fetch(`/api/apis/${apiId}`, {
      method: "PATCH",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);
    const api = readManagedApi(payload);

    if (response.ok && api) {
      return { ok: true, api };
    }

    return {
      ok: false,
      message: readErrorMessage(payload) ?? "The API could not be updated. Try again.",
    };
  } catch {
    return {
      ok: false,
      message: "The API could not be updated. Try again.",
    };
  }
}

function readManagedApi(payload: unknown): ManagedApi | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as { success?: unknown; api?: unknown };

  if (record.success !== true || typeof record.api !== "object" || record.api === null) {
    return null;
  }

  const api = record.api as { name?: unknown; slug?: unknown; status?: unknown };

  if (typeof api.name !== "string" || typeof api.slug !== "string") {
    return null;
  }

  if (api.status !== "ACTIVE" && api.status !== "DISABLED") {
    return null;
  }

  return {
    name: api.name,
    slug: api.slug,
    status: api.status,
  };
}
