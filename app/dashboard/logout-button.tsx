"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function LogoutButton() {
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
    <div className="mt-4">
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        aria-busy={pending}
        className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
      >
        {pending ? "Logging out…" : "Log out"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
