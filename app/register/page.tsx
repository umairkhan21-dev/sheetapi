"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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

export default function RegisterPage() {
  const router = useRouter();
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
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ name, email, password }),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(readErrorMessage(body, "Could not create account."));
        submitting.current = false;
        setPending(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not create account. Check your connection and try again.");
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

        <h1 className="mt-8 text-2xl font-bold">Create account</h1>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Name
            <input
              name="name"
              type="text"
              required
              maxLength={191}
              autoComplete="name"
              className="rounded-lg border border-zinc-200 px-3 py-2 font-normal outline-none focus:border-blue-600"
            />
          </label>

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
            {pending ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <Link href="/login" className="mt-6 text-sm text-zinc-600 hover:text-zinc-900">
          Already have an account? Login
        </Link>
      </div>
    </main>
  );
}
