"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { secondaryButtonClass } from "@/app/dashboard/ui";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (submitting.current) {
      return;
    }

    submitting.current = true;
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        setError("Logout failed. Try again.");
        submitting.current = false;
        setPending(false);
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      setError("Logout failed. Check your connection and try again.");
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <div className={compact ? "relative" : "mt-4"}>
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        aria-busy={pending}
        className={secondaryButtonClass}
      >
        {pending ? "Logging out…" : "Log out"}
      </button>
      {error ? (
        <p
          role="alert"
          className={
            compact
              ? "absolute right-0 z-30 mt-2 w-56 rounded-lg border border-red-200 bg-white p-2 text-left text-xs text-red-700 shadow-sm"
              : "mt-2 text-sm text-red-700"
          }
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
