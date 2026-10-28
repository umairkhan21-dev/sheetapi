"use client";

import { useId, useRef, useState } from "react";
import {
  notifySpreadsheetSelected,
  readErrorMessage,
} from "@/app/dashboard/save-spreadsheet-selection";
import { dangerButtonClass, secondaryButtonClass } from "@/app/dashboard/ui";

type DisconnectSpreadsheetButtonProps = {
  spreadsheetId: string;
  spreadsheetName: string;
  disabled?: boolean;
  onDisconnected: (message: string) => void;
};

export function DisconnectSpreadsheetButton({
  spreadsheetId,
  spreadsheetName,
  disabled = false,
  onDisconnected,
}: DisconnectSpreadsheetButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  function openDialog() {
    if (submitting.current || disabled) {
      return;
    }

    setError(null);
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    if (submitting.current) {
      return;
    }

    dialogRef.current?.close();
    setOpen(false);
  }

  async function disconnectSpreadsheet() {
    if (submitting.current) {
      return;
    }

    submitting.current = true;
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/google/sheets/selection/${encodeURIComponent(spreadsheetId)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      const result = readDisconnectResult(payload);

      if (!response.ok || !result) {
        setError(
          readErrorMessage(payload) ??
            "The spreadsheet could not be disconnected. Try again.",
        );
        return;
      }

      notifySpreadsheetSelected();
      dialogRef.current?.close();
      setOpen(false);
      onDisconnected(successMessage(result.name, result.affectedApis));
    } catch {
      setError(
        "The spreadsheet could not be disconnected. Check your connection and try again.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled || open || pending}
        className="text-sm font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
      >
        Disconnect
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(100%,28rem)] rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-lg backdrop:bg-slate-900/40"
        onCancel={(event) => {
          if (pending) {
            event.preventDefault();
          }
        }}
        onClose={() => {
          if (!submitting.current) {
            setOpen(false);
          }
        }}
      >
        <div className="space-y-4 p-4">
          <h2 id={titleId} className="text-base font-semibold">
            Disconnect {spreadsheetName}?
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            SheetAPI will remove this spreadsheet selection. It will not delete
            or change the Google spreadsheet, its worksheets, or its rows. API
            configurations that use this spreadsheet stay saved, but they will
            not return its data until you save the spreadsheet again.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={closeDialog}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={dangerButtonClass}
              onClick={() => {
                void disconnectSpreadsheet();
              }}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? "Disconnecting…" : "Disconnect spreadsheet"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function successMessage(name: string, affectedApis: number) {
  const apiText =
    affectedApis === 0
      ? "No API configurations used it."
      : affectedApis === 1
        ? "1 API configuration can no longer read it until you save it again."
        : `${affectedApis} API configurations can no longer read it until you save it again.`;

  return `Disconnected ${name}. The Google spreadsheet was not changed. ${apiText}`;
}

function readDisconnectResult(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as {
    success?: unknown;
    affectedApis?: unknown;
    spreadsheet?: unknown;
  };

  if (record.success !== true || typeof record.spreadsheet !== "object" || record.spreadsheet === null) {
    return null;
  }

  const spreadsheet = record.spreadsheet as { name?: unknown };

  if (
    typeof spreadsheet.name !== "string" ||
    !Number.isInteger(record.affectedApis) ||
    Number(record.affectedApis) < 0
  ) {
    return null;
  }

  return {
    name: spreadsheet.name,
    affectedApis: record.affectedApis as number,
  };
}
