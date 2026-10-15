"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readErrorMessage } from "@/app/dashboard/save-spreadsheet-selection";
import { dangerButtonClass, secondaryButtonClass } from "@/app/dashboard/ui";

type DisconnectGoogleButtonProps = {
  returnPath: "/dashboard" | "/dashboard/sheets" | "/dashboard/settings";
};

export function DisconnectGoogleButton({
  returnPath,
}: DisconnectGoogleButtonProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  function openDialog() {
    if (submitting.current) {
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

  async function disconnectGoogle() {
    if (submitting.current) {
      return;
    }

    submitting.current = true;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/google", {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);
      const revoked = readRevoked(payload);

      if (!response.ok || revoked == null) {
        setError(
          readErrorMessage(payload) ??
            "Google Sheets could not be disconnected. Try again.",
        );
        return;
      }

      dialogRef.current?.close();
      setOpen(false);
      router.push(`${returnPath}?google=disconnected&revoked=${revoked ? "1" : "0"}`);
      router.refresh();
    } catch {
      setError(
        "Google Sheets could not be disconnected. Check your connection and try again.",
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
        disabled={open || pending}
        className={dangerButtonClass}
      >
        Disconnect Google account
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(100%,28rem)] rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-lg backdrop:bg-zinc-900/40"
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
            Disconnect Google account?
          </h2>
          <p className="text-sm leading-6 text-zinc-600">
            SheetAPI will remove its stored Google authorization. It will not
            delete your Google account or any files in Google Drive. Your
            SheetAPI account, API configurations, and API keys stay saved.
            Those APIs cannot read spreadsheet data until you connect Google
            Sheets again. If Google confirms the revocation, you may need to
            choose those spreadsheets again after reconnecting.
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
                void disconnectGoogle();
              }}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? "Disconnecting…" : "Disconnect Google account"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function readRevoked(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as { success?: unknown; revoked?: unknown };

  if (record.success !== true || typeof record.revoked !== "boolean") {
    return null;
  }

  return record.revoked;
}
