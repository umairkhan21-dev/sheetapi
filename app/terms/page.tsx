import type { Metadata } from "next";
import Link from "next/link";
import { PageSection, PublicPage } from "@/app/site-chrome";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "Acceptable use, API keys, availability, and limits for the current SheetAPI application.",
};

export default function TermsPage() {
  return (
    <PublicPage
      title="Terms of service"
      lede="These terms describe the SheetAPI application as it works today. They are a practical notice for a small hosted service, not a law-firm agreement."
    >
      <aside className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">Needs owner or legal review</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>The legal name, address, and contact email of the operator.</li>
          <li>Governing law, venue, and how formal notices are delivered.</li>
          <li>Whether any paid plan, refund, or cancellation policy will exist. The app has no billing flow.</li>
          <li>Any liability cap, indemnity, or data-processing terms a customer or regulator requires.</li>
        </ul>
      </aside>

      <PageSection id="service" title="The service">
        <p>
          SheetAPI lets a signed-in user connect selected Google Sheets files
          and expose one worksheet as an HTTP API. The current application does
          not sell subscriptions or take payment. Features that are not
          described in the <Link href="/docs">API documentation</Link> are not
          part of the service.
        </p>
      </PageSection>

      <PageSection id="accounts" title="Accounts">
        <p>
          You are responsible for the activity on your account and for keeping
          the password confidential. Passwords must be 8 to 72 characters. The
          session cookie lasts 7 days. Logout clears that cookie only. A stolen
          cookie can keep working until it expires or the password is changed.
          There is no in-app way to delete the account record.
        </p>
      </PageSection>

      <PageSection id="keys" title="API keys">
        <p>
          API key secrets are shown once. You are responsible for where they
          are stored and who can use them. A key can read and change the
          worksheet behind that API until you revoke it. SheetAPI stores only
          a hash of the secret. Revocation is available in the dashboard.
          Sending a key in a query string is rejected.
        </p>
      </PageSection>

      <PageSection id="use" title="Acceptable use">
        <p>
          Do not use SheetAPI to break the law, to access a Google file or
          account you are not allowed to use, to probe or overload the
          service, or to hide the origin of abusive traffic. Do not upload
          worksheet data you do not have the right to process. Google&apos;s
          own terms also apply to the files and the Google APIs.
        </p>
      </PageSection>

      <PageSection id="data" title="Data ownership">
        <p>
          You keep ownership of the Google Sheet. SheetAPI does not take
          ownership of cell values. Those values stay in Google Sheets and are
          read or written when an API call runs. You are responsible for the
          contents of the sheet and for who receives an API key. Configuration
          stored by SheetAPI, such as the API name, slug, and key hash, is
          kept so the service can run. See the{" "}
          <Link href="/privacy">privacy policy</Link> for what is stored.
        </p>
      </PageSection>

      <PageSection id="availability" title="Availability, limits, and changes">
        <p>
          The service is provided as available. There is no uptime guarantee,
          support agreement, or backup promise in the application. Public API
          calls are limited to 120 requests per minute in production for each
          API key. Sign-in and password flows have separate limits. Worksheets
          are limited to 10,000 data rows, 200 columns, and 50,000 characters
          in a cell. Requests outside those limits fail instead of returning a
          partial sheet. The operator may change, suspend, or stop the service,
          and may disable an API or refuse traffic that threatens the service
          or other people&apos;s data.
        </p>
      </PageSection>

      <PageSection id="third-parties" title="Third-party services">
        <p>
          Google Sheets, Google Drive, and Google sign-in are required for the
          product. If SMTP is configured, a mail provider sends password-reset
          messages. The app&apos;s database is MySQL or MariaDB chosen by the
          operator. Outages or policy changes at those services can stop
          SheetAPI from working. SheetAPI does not control Google&apos;s
          retention of the spreadsheet.
        </p>
      </PageSection>

      <PageSection id="suspension" title="Suspension and ending use">
        <p>
          You may stop using the service, disconnect Google, revoke keys, and
          delete API configurations. The operator may suspend access when use
          breaks these terms or puts the service at risk. Suspension is an
          operational step. It is not a court process, and the app does not
          implement a formal appeal workflow.
        </p>
      </PageSection>

      <PageSection id="disclaimer" title="Disclaimer">
        <p>
          SheetAPI is provided as is. To the extent the law allows, the
          operator disclaims warranties of merchantability, fitness for a
          particular purpose, and uninterrupted or error-free operation. The
          operator is not liable for lost sheet data, lost profits, or indirect
          damages arising from use of the service, except where a liability
          limit would not be allowed. The enforceable limit, if any, has not
          been set and needs legal review. These terms do not claim that the
          service complies with any particular statute.
        </p>
      </PageSection>
    </PublicPage>
  );
}
