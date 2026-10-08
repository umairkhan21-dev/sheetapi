import Link from "next/link";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { SpreadsheetList } from "@/app/dashboard/spreadsheet-list";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ERROR_MESSAGES = {
  unauthorized: "Sign in before connecting Google Sheets.",
  denied: "Google authorization was cancelled.",
  invalid: "Google connection could not be verified. Try again.",
  failed: "Google Sheets could not be connected. Try again.",
} as const;

function readParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams;
  const google = readParam(params.google);
  const reason = readParam(params.reason);
  const user = await getCurrentUser();
  const connection = user
    ? await prisma.googleConnection.findUnique({
        where: { userId: user.id },
        select: { id: true },
      })
    : null;
  const errorMessage =
    google === "error"
      ? reason && reason in ERROR_MESSAGES
        ? ERROR_MESSAGES[reason as keyof typeof ERROR_MESSAGES]
        : ERROR_MESSAGES.failed
      : null;

  return (
    <main className="min-h-screen bg-white text-zinc-900">
      <div className="mx-auto flex max-w-xl flex-col px-6 py-16">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          SheetAPI
        </Link>

        <h1 className="mt-6 text-2xl font-bold">Dashboard</h1>

        {user ? (
          <>
            <p className="mt-2 text-sm text-zinc-600">{user.email}</p>
            <LogoutButton />
          </>
        ) : (
          <p className="mt-4 text-zinc-600">
            Sign in to connect Google Sheets.
          </p>
        )}

        {user && connection ? (
          <div className="mt-8">
            <p className="font-medium">Google Sheets connected</p>
            <a
              href="/api/auth/google"
              className="mt-4 inline-block rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              Reconnect
            </a>
            <SpreadsheetList />
          </div>
        ) : null}

        {user && !connection ? (
          <a
            href="/api/auth/google"
            className="mt-8 inline-block w-fit rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Connect Google Sheets
          </a>
        ) : null}

        {google === "connected" ? (
          <p className="mt-4 text-sm text-green-700">
            Google account connected.
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 text-sm text-red-700">{errorMessage}</p>
        ) : null}
      </div>
    </main>
  );
}
