import Link from "next/link";
import { ApiListRow } from "@/app/dashboard/manage-api";
import { prisma } from "@/lib/prisma";
import { hasGoogleConnection, requireDashboardUser } from "@/app/dashboard/session";
import {
  apiListColumnsClass,
  formatTimestamp,
  Notice,
  PageHeader,
  primaryButtonClass,
} from "@/app/dashboard/ui";

export const metadata = {
  title: "My APIs",
};

type ApisPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ApisPage({ searchParams }: ApisPageProps) {
  const user = await requireDashboardUser();
  const deleted = (await searchParams).deleted === "1";
  const [apis, savedSpreadsheets, googleConnected] = await Promise.all([
    prisma.api.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        spreadsheetId: true,
        worksheetName: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.selectedSpreadsheet.findMany({
      where: { userId: user.id },
      select: { spreadsheetId: true },
    }),
    hasGoogleConnection(user.id),
  ]);
  const savedSpreadsheetIds = new Set(
    savedSpreadsheets.map((spreadsheet) => spreadsheet.spreadsheetId),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My APIs"
        description="Saved configurations that expose one worksheet as JSON."
        action={
          <Link href="/dashboard/apis/new" className={primaryButtonClass}>
            Create API
          </Link>
        }
      />

      {deleted ? (
        <Notice tone="success">
          The API was deleted. The Google spreadsheet and worksheet were not
          deleted.
        </Notice>
      ) : null}

      {apis.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-600">
          No APIs yet. Create one from a spreadsheet you have saved.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div
            className={`hidden gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-500 md:grid ${apiListColumnsClass}`}
          >
            <span>Name</span>
            <span>Worksheet</span>
            <span>Status</span>
            <span>Endpoint</span>
            <span>Created</span>
            <span>Actions</span>
          </div>
          <ul className="divide-y divide-zinc-200">
            {apis.map((api) => (
              <ApiListRow
                key={api.id}
                apiId={api.id}
                apiName={api.name}
                worksheetName={api.worksheetName}
                slug={api.slug}
                status={api.status}
                spreadsheetSaved={savedSpreadsheetIds.has(api.spreadsheetId)}
                googleConnected={googleConnected}
                createdLabel={
                  formatTimestamp(api.createdAt.toISOString()) ??
                  api.createdAt.toISOString()
                }
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
