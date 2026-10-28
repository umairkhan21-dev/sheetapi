import Link from "next/link";
import { DisconnectGoogleButton } from "@/app/dashboard/disconnect-google-button";
import { GoogleDisconnectNotice } from "@/app/dashboard/google-disconnect-notice";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Notice,
  PageHeader,
  primaryButtonClass,
  StatusBadge,
} from "@/app/dashboard/ui";

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

function googleErrorMessage(google: string | undefined, reason: string | undefined) {
  if (google !== "error") {
    return null;
  }

  if (reason && reason in ERROR_MESSAGES) {
    return ERROR_MESSAGES[reason as keyof typeof ERROR_MESSAGES];
  }

  return ERROR_MESSAGES.failed;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams;
  const google = readParam(params.google);
  const reason = readParam(params.reason);
  const errorMessage = googleErrorMessage(google, reason);
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-white px-6 py-16 text-slate-900">
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Sheet<span className="text-green-600">API</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm leading-6 text-slate-600">
            Sign in to connect Google Sheets.
          </p>
          {google === "connected" ? (
            <Notice tone="success">Google account connected.</Notice>
          ) : null}
          {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
          <Link href="/login" className={`${primaryButtonClass} w-fit`}>
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const [connection, apiCount] = await Promise.all([
    prisma.googleConnection.findUnique({
      where: { userId: user.id },
      select: { id: true },
    }),
    prisma.api.count({
      where: { userId: user.id },
    }),
  ]);
  const googleConnected = connection !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`Welcome back, ${user.name}. Connect a spreadsheet, then create an API for one worksheet.`}
      />

      {google === "connected" ? (
        <Notice tone="success">Google account connected.</Notice>
      ) : null}
      <GoogleDisconnectNotice google={google} revoked={readParam(params.revoked)} />
      {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}

      <dl className="grid overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-2">
        <div className="px-4 py-3">
          <dt className="text-sm text-slate-500">Google Sheets</dt>
          <dd className="mt-2 flex flex-wrap items-center gap-3">
            <StatusBadge tone={googleConnected ? "success" : "neutral"}>
              {googleConnected ? "Connected" : "Not connected"}
            </StatusBadge>
            {googleConnected ? (
              <DisconnectGoogleButton returnPath="/dashboard" />
            ) : null}
          </dd>
        </div>
        <div className="border-t border-slate-200 px-4 py-3 sm:border-t-0 sm:border-l">
          <dt className="text-sm text-slate-500">APIs</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">{apiCount}</dd>
        </div>
      </dl>

      <section aria-labelledby="overview-shortcuts-heading">
        <h2
          id="overview-shortcuts-heading"
          className="text-sm font-medium text-slate-900"
        >
          Shortcuts
        </h2>
        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <li>
            {googleConnected ? (
              <ShortcutLink
                href="/dashboard/sheets"
                title="Google Sheets"
                detail="Choose a spreadsheet and preview a worksheet."
              />
            ) : (
              <a
                href="/api/auth/google"
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    Connect Google Sheets
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-600">
                    Grant access to the spreadsheets you want to use.
                  </span>
                </span>
                <span aria-hidden="true" className="text-sm text-slate-400">
                  →
                </span>
              </a>
            )}
          </li>
          <li>
            <ShortcutLink
              href="/dashboard/apis"
              title="My APIs"
              detail={
                apiCount === 1
                  ? "1 saved API configuration."
                  : `${apiCount} saved API configurations.`
              }
            />
          </li>
          <li>
            <ShortcutLink
              href="/dashboard/apis/new"
              title="Create API"
              detail="Turn one saved worksheet into a JSON endpoint."
            />
          </li>
          <li>
            <ShortcutLink
              href="/dashboard/settings"
              title="Settings"
              detail="Account details and Google connection."
            />
          </li>
        </ul>
      </section>
    </div>
  );
}

function ShortcutLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
    >
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block text-sm text-slate-600">{detail}</span>
      </span>
      <span aria-hidden="true" className="text-sm text-slate-400">
        →
      </span>
    </Link>
  );
}
