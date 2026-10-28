"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readErrorMessage } from "@/app/dashboard/save-spreadsheet-selection";
import { dangerButtonClass, secondaryButtonClass } from "@/app/dashboard/ui";

type DeleteApiButtonProps = {
  apiId: number;
  apiName: string;
  appearance?: "button" | "text";
};

export function DeleteApiButton({
  apiId,
  apiName,
  appearance = "button",
}: DeleteApiButtonProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function deleteApi() {
    if (submitting.current) {
      return;
    }

    submitting.current = true;
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/apis/${apiId}`, {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          readErrorMessage(payload) ?? "The API could not be deleted. Try again.",
        );
        return;
      }

      dialogRef.current?.close();
      setOpen(false);
      router.push("/dashboard/apis?deleted=1");
      router.refresh();
    } catch {
      setError("The API could not be deleted. Try again.");
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
        className={
          appearance === "text"
            ? "text-sm font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            : dangerButtonClass
        }
      >
        {appearance === "text" ? "Delete" : "Delete API"}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`delete-api-title-${apiId}`}
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
          <h2 id={`delete-api-title-${apiId}`} className="text-base font-semibold">
            Delete {apiName}?
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            This deletes the API configuration and its keys. It does not delete
            the Google spreadsheet or worksheet.
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
              onClick={deleteApi}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete API"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
