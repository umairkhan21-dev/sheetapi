import { DisconnectGoogleButton } from "@/app/dashboard/disconnect-google-button";
import { GoogleDisconnectNotice } from "@/app/dashboard/google-disconnect-notice";
import { SpreadsheetList } from "@/app/dashboard/spreadsheet-list";
import { SpreadsheetPicker } from "@/app/dashboard/spreadsheet-picker";
import { hasGoogleConnection, requireDashboardUser } from "@/app/dashboard/session";
import {
  Notice,
  PageHeader,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from "@/app/dashboard/ui";

export const metadata = {
  title: "Google Sheets",
};

type GoogleSheetsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function GoogleSheetsPage({
  searchParams,
}: GoogleSheetsPageProps) {
  const params = await searchParams;
  const user = await requireDashboardUser();
  const googleConnected = await hasGoogleConnection(user.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Google Sheets"
        description="Connect Google, save a spreadsheet, and preview a worksheet."
        action={
          <a
            href="/api/auth/google"
            className={googleConnected ? secondaryButtonClass : primaryButtonClass}
          >
            {googleConnected ? "Reconnect" : "Connect Google Sheets"}
          </a>
        }
      />

      <GoogleDisconnectNotice
        google={readParam(params.google)}
        revoked={readParam(params.revoked)}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-500">Connection</span>
        <StatusBadge tone={googleConnected ? "success" : "neutral"}>
          {googleConnected ? "Connected" : "Not connected"}
        </StatusBadge>
        {googleConnected ? (
          <DisconnectGoogleButton returnPath="/dashboard/sheets" />
        ) : null}
      </div>

      {googleConnected ? (
        <>
          <SpreadsheetPicker />
          <SpreadsheetList />
        </>
      ) : (
        <Notice tone="info">
          Connect Google Sheets to choose a spreadsheet. SheetAPI only requests
          access to files you pick.
        </Notice>
      )}
    </div>
  );
}
