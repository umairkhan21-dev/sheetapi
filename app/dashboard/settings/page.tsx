import Link from "next/link";
import { DisconnectGoogleButton } from "@/app/dashboard/disconnect-google-button";
import { GoogleDisconnectNotice } from "@/app/dashboard/google-disconnect-notice";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { hasGoogleConnection, requireDashboardUser } from "@/app/dashboard/session";
import {
  PageHeader,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from "@/app/dashboard/ui";

export const metadata = {
  title: "Settings",
};

type SettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const user = await requireDashboardUser();
  const googleConnected = await hasGoogleConnection(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Account details for this SheetAPI login and the Google Sheets connection."
      />

      <GoogleDisconnectNotice
        google={readParam(params.google)}
        revoked={readParam(params.revoked)}
      />

      <div className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <section className="px-4 py-4" aria-labelledby="account-settings-heading">
          <h2 id="account-settings-heading" className="text-sm font-semibold">
            Account
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="grid gap-1 sm:grid-cols-3">
              <dt className="text-zinc-500">Name</dt>
              <dd className="text-zinc-900 sm:col-span-2">{user.name}</dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-3">
              <dt className="text-zinc-500">Email</dt>
              <dd className="text-zinc-900 sm:col-span-2">{user.email}</dd>
            </div>
          </dl>
          <LogoutButton />
        </section>

        <section className="px-4 py-4" aria-labelledby="google-settings-heading">
          <h2 id="google-settings-heading" className="text-sm font-semibold">
            Google Sheets
          </h2>
          <div className="mt-3">
            <StatusBadge tone={googleConnected ? "success" : "neutral"}>
              {googleConnected ? "Connected" : "Not connected"}
            </StatusBadge>
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Spreadsheet selection and worksheet preview are on the Google
            Sheets page. SheetAPI only requests access to files you pick.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="/api/auth/google"
              className={googleConnected ? secondaryButtonClass : primaryButtonClass}
            >
              {googleConnected ? "Reconnect" : "Connect Google Sheets"}
            </a>
            {googleConnected ? (
              <DisconnectGoogleButton returnPath="/dashboard/settings" />
            ) : null}
            <Link href="/dashboard/sheets" className={secondaryButtonClass}>
              Open Google Sheets
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
