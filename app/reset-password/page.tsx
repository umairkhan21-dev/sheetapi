"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import {
  PASSWORD_REQUIREMENT_MESSAGE,
  PASSWORD_RESET_INVALID_MESSAGE,
  getPasswordValidationError,
} from "@/lib/password";

function readErrorMessage(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error.trim()
  ) {
    return body.error;
  }

  return fallback;
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(
    token ? null : PASSWORD_RESET_INVALID_MESSAGE,
  );
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current || !token) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    const passwordError = getPasswordValidationError(password);

    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    submitting.current = true;
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ token, password }),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(readErrorMessage(body, PASSWORD_RESET_INVALID_MESSAGE));
        submitting.current = false;
        setPending(false);
        return;
      }

      router.push("/login?reset=success");
      router.refresh();
    } catch {
      setError("Could not reset your password. Check your connection and try again.");
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <div className="mx-auto flex max-w-md flex-col px-6 py-16">
        <Link href="/" className="text-xl font-bold">
          Sheet<span className="text-blue-600">API</span>
        </Link>

        <h1 className="mt-8 text-2xl font-bold">Reset password</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Choose a new password. The reset link expires after 1 hour and can
          only be used once.
        </p>

        {token ? (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm font-medium">
              New password
              <input
                name="password"
                type="password"
                required
                autoComplete="new-password"
                aria-describedby="password-requirements"
                className="rounded-lg border border-zinc-200 px-3 py-2 font-normal outline-none focus:border-blue-600"
              />
            </label>

            <p id="password-requirements" className="text-sm text-zinc-600">
              {PASSWORD_REQUIREMENT_MESSAGE}
            </p>

            <label className="flex flex-col gap-2 text-sm font-medium">
              Confirm new password
              <input
                name="confirmation"
                type="password"
                required
                autoComplete="new-password"
                className="rounded-lg border border-zinc-200 px-3 py-2 font-normal outline-none focus:border-blue-600"
              />
            </label>

            {error ? (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {pending ? "Saving password…" : "Reset password"}
            </button>
          </form>
        ) : (
          <p role="alert" className="mt-8 text-sm text-red-700">
            {PASSWORD_RESET_INVALID_MESSAGE}
          </p>
        )}

        <Link
          href="/forgot-password"
          className="mt-6 text-sm text-zinc-600 hover:text-zinc-900"
        >
          Request a new reset link
        </Link>
        <Link href="/login" className="mt-3 text-sm text-zinc-600 hover:text-zinc-900">
          Back to login
        </Link>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white text-zinc-900">
          <div className="mx-auto flex max-w-md flex-col px-6 py-16">
            <p className="text-sm text-zinc-600">Loading reset form…</p>
          </div>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
