import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiKeys } from "@/app/dashboard/api-keys";
import { CopyButton } from "@/app/dashboard/copy-button";
import { ApiDetailSettings } from "@/app/dashboard/manage-api";
import { SpreadsheetPreview } from "@/app/dashboard/spreadsheet-preview";
import { hasGoogleConnection, requireDashboardUser } from "@/app/dashboard/session";
import { formatTimestamp } from "@/app/dashboard/ui";
import { buildPublicApiUrl } from "@/lib/api-config";
import { getAppUrl } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "API details",
};

type ApiDetailsPageProps = {
  params: Promise<{ apiId: string }>;
};

function parseApiId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const apiId = Number(value);

  if (!Number.isSafeInteger(apiId)) {
    return null;
  }

  return apiId;
}

export default async function ApiDetailsPage({ params }: ApiDetailsPageProps) {
  const user = await requireDashboardUser();
  const apiId = parseApiId((await params).apiId);

  if (apiId == null) {
    notFound();
  }

  const api = await prisma.api.findFirst({
    where: {
      id: apiId,
      userId: user.id,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      spreadsheetId: true,
      worksheetId: true,
      worksheetName: true,
      status: true,
      createdAt: true,
    },
  });

  if (!api) {
    notFound();
  }

  const [spreadsheet, googleConnected] = await Promise.all([
    prisma.selectedSpreadsheet.findUnique({
      where: {
        userId_spreadsheetId: {
          userId: user.id,
          spreadsheetId: api.spreadsheetId,
        },
      },
      select: {
        name: true,
      },
    }),
    hasGoogleConnection(user.id),
  ]);
  const url = buildPublicApiUrl(getAppUrl(), api.slug);
  const created =
    formatTimestamp(api.createdAt.toISOString()) ?? api.createdAt.toISOString();

  return (
    <div className="space-y-8">
      <ApiDetailSettings
        key={api.id}
        apiId={api.id}
        apiName={api.name}
        status={api.status}
        slug={api.slug}
        spreadsheetSaved={spreadsheet !== null}
        googleConnected={googleConnected}
      />

      <dl className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <DetailRow label="Endpoint">
          <div className="flex flex-col items-start gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-sm text-blue-700 hover:underline"
            >
              {url}
            </a>
            <CopyButton value={url} label="Copy URL" />
          </div>
        </DetailRow>
        <DetailRow label="Spreadsheet">
          {spreadsheet ? (
            spreadsheet.name
          ) : (
            <span>
              This spreadsheet selection was disconnected. The Google
              spreadsheet was not deleted.{" "}
              <Link
                href="/dashboard/sheets"
                className="font-medium text-blue-700 hover:underline"
              >
                Open Google Sheets
              </Link>
            </span>
          )}
        </DetailRow>
        <DetailRow label="Worksheet">{api.worksheetName}</DetailRow>
        <DetailRow label="Created">{created}</DetailRow>
      </dl>

      <ApiKeys apiId={api.id} />

      <section aria-labelledby="api-preview-heading" className="space-y-3">
        <div>
          <h2
            id="api-preview-heading"
            className="text-base font-semibold text-zinc-900"
          >
            Preview
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            The linked worksheet as a table and JSON. Large sheets show the
            first 100 rows and 50 columns.
          </p>
        </div>
        {spreadsheet && googleConnected ? (
          <SpreadsheetPreview
            spreadsheetId={api.spreadsheetId}
            spreadsheetName={spreadsheet.name}
            sheetId={api.worksheetId}
            hideHeading
          />
        ) : (
          <p className="text-sm text-zinc-600">
            {spreadsheet
              ? "Reconnect Google Sheets before this worksheet can be previewed. No spreadsheet data is shown."
              : "Save the spreadsheet again to load a preview. No spreadsheet data is shown."}
          </p>
        )}
      </section>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-3 sm:gap-4">
      <dt className="font-medium text-zinc-500">{label}</dt>
      <dd className="text-zinc-900 sm:col-span-2">{children}</dd>
    </div>
  );
}
