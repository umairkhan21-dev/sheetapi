import Link from "next/link";
import { CreateApiForm } from "@/app/dashboard/create-api-form";
import { requireDashboardUser, hasGoogleConnection } from "@/app/dashboard/session";
import {
  Notice,
  PageHeader,
  secondaryButtonClass,
} from "@/app/dashboard/ui";

export const metadata = {
  title: "Create API",
};

type CreateApiPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSpreadsheetId(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > 256) {
    return "";
  }

  return trimmed;
}

export default async function CreateApiPage({
  searchParams,
}: CreateApiPageProps) {
  const user = await requireDashboardUser();
  const params = await searchParams;
  const googleConnected = await hasGoogleConnection(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create API"
        description="Turn one saved worksheet into a read-only JSON endpoint."
        action={
          <Link href="/dashboard/apis" className={secondaryButtonClass}>
            Back to My APIs
          </Link>
        }
      />

      {googleConnected ? null : (
        <Notice tone="info">
          Connect Google Sheets before creating an API.{" "}
          <a href="/api/auth/google" className="font-medium text-green-700 hover:underline">
            Connect Google Sheets
          </a>
        </Notice>
      )}

      <CreateApiForm
        embedded
        initialSpreadsheetId={readSpreadsheetId(params.spreadsheet)}
      />
    </div>
  );
}
