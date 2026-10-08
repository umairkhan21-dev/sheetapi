"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { PASSWORD_RESET_SUCCESS_MESSAGE } from "@/lib/password";

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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const passwordReset = searchParams.get("reset") === "success";
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) {
      return;
    }

    submitting.current = true;
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(readErrorMessage(body, "Login failed."));
        submitting.current = false;
        setPending(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Login failed. Check your connection and try again.");
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

        <h1 className="mt-8 text-2xl font-bold">Login</h1>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-lg border border-zinc-200 px-3 py-2 font-normal outline-none focus:border-blue-600"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium">
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-lg border border-zinc-200 px-3 py-2 font-normal outline-none focus:border-blue-600"
            />
          </label>

          <Link
            href="/forgot-password"
            className="text-sm font-normal text-blue-600 hover:text-blue-700"
          >
            Forgot password?
          </Link>

          {passwordReset ? (
            <p role="status" className="text-sm text-green-700">
              {PASSWORD_RESET_SUCCESS_MESSAGE}
            </p>
          ) : null}

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
            {pending ? "Logging in…" : "Login"}
          </button>
        </form>

        <Link
          href="/register"
          className="mt-6 text-sm text-zinc-600 hover:text-zinc-900"
        >
          Create an account
        </Link>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
