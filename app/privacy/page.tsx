import type { Metadata } from "next";
import { PageSection, PublicPage } from "@/app/site-chrome";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What SheetAPI stores about accounts, Google connections, and API keys, and what it reads from Google Sheets.",
};

export default function PrivacyPage() {
  return (
    <PublicPage
      title="Privacy policy"
      lede="This page describes how the current SheetAPI application handles account, Google, and API data. It is not a complete legal notice."
    >
      <aside className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        SheetAPI has not published a company name, postal address, or contact
        email. A fixed retention period and a legal-entity privacy contact
        still need the product owner or counsel. Nothing on this page is a
        certification or a promise of a particular legal regime.
      </aside>

      <PageSection id="accounts" title="Account information">
        <p>
          Registration asks for a name, email address, and password. The
          password is stored as a bcrypt hash. SheetAPI does not keep the
          password itself. A signed-in session is an HTTP-only cookie that
          expires after 7 days. In production that cookie is marked Secure.
          Logout clears the cookie. Changing the password causes older session
          tokens to be rejected. There is no in-app control that deletes the
          whole account.
        </p>
        <p>
          Password reset emails, when SMTP is configured, contain a one-time
          link. SheetAPI stores only a SHA-256 hash of that token. The token
          expires after one hour. Requesting another reset marks older unused
          tokens as used. The raw token is not written to the application log
          by the reset flow. The sender address is whatever the operator sets
          as <code>EMAIL_FROM</code>. That setting is not a published support
          address.
        </p>
      </PageSection>

      <PageSection id="google" title="Google OAuth and permissions">
        <p>
          Connecting Google uses Google&apos;s OAuth screen. The only scope the
          application requests is{" "}
          <code>https://www.googleapis.com/auth/drive.file</code>. That scope
          lets SheetAPI open files the user selects with this app, including
          through the Google Picker. It is not a request for access to the
          user&apos;s entire Google Drive.
        </p>
        <p>
          SheetAPI stores the Google account id, access token, refresh token
          when Google provides one, and the token expiry time. In production
          those tokens are sealed with AES-256-GCM before they are written to
          the database. Disconnecting Google asks Google to revoke the token
          and then deletes the stored connection. Google files are not deleted.
          If Google does not confirm revocation, the connection row is still
          removed and the user may still need to remove SheetAPI from their
          Google Account permissions.
        </p>
      </PageSection>

      <PageSection id="sheets" title="Spreadsheet data">
        <p>
          Saved spreadsheet records store the Google file id, the display name,
          and an optional modified time. An API configuration stores its name,
          URL slug, spreadsheet id, worksheet id, worksheet name, and whether
          it is active. Worksheet cell values are not copied into
          SheetAPI&apos;s database. A public API request reads the current
          worksheet from Google Sheets, and a write sends the change back to
          that worksheet.
        </p>
        <p>
          A short dashboard preview also reads a limited range from Google at
          the time it is opened. That preview is not stored as the source of
          the public API.
        </p>
      </PageSection>

      <PageSection id="keys" title="API keys and requests">
        <p>
          An API key secret is shown when it is created. After that, SheetAPI
          stores a SHA-256 hash and a short prefix, plus the key name, creation
          time, last-used time, and revocation time. Public requests send the
          secret in the <code>Authorization: Bearer</code> header. The key is
          not accepted in the query string. Revoking a key keeps the row and
          marks it revoked so the secret stops working.
        </p>
        <p>
          Public requests are rate limited. The limiter stores a counter for a
          hash of the bearer credential, or a shared non-IP bucket when no
          trusted proxy is configured. It does not store the API key or the
          worksheet contents. Sign-in, registration, and password reset have
          separate request limits.
        </p>
      </PageSection>

      <PageSection id="security" title="Security measures">
        <p>
          The measures in the current application include hashed passwords and
          API keys, sealed Google tokens in production, HTTP-only session
          cookies, production cookie and transport headers, and request rate
          limits. These reduce some common risks. They are not a security
          certification, and they do not prevent every misuse of a stolen API
          key or session cookie.
        </p>
      </PageSection>

      <PageSection id="retention" title="Retention and deletion">
        <p>
          The application does not implement a fixed deletion schedule, and it
          has no account-deletion control. Logout clears the session cookie.
          Changing the password rejects older sessions. Disconnecting Google
          deletes the stored connection. Removing a saved spreadsheet deletes
          that selection and does not delete the Google file. Deleting an API
          configuration removes that configuration and its key rows from
          SheetAPI. It does not delete the worksheet. Revoking a key keeps the
          hash and marks it revoked. Password-reset rows are marked used and
          are not deleted. Rate-limit counters are replaced as later requests
          are recorded.
        </p>
      </PageSection>

      <PageSection id="third-parties" title="Third-party services">
        <p>
          Google provides sign-in for the Sheets connection, the file picker,
          and the spreadsheet reads and writes. If the operator configures
          SMTP, a mail provider delivers password-reset messages. Account and
          configuration data are stored in the operator&apos;s MySQL or MariaDB
          database. The application code does not include a separate analytics
          or advertising service. Hosting, database, and mail providers are
          chosen by the operator and are not named here.
        </p>
      </PageSection>

      <PageSection id="rights" title="Your choices">
        <p>
          You can stop using SheetAPI, disconnect Google, revoke API keys, and
          delete API configurations from the dashboard. You can also remove
          SheetAPI from your Google Account permissions. Because the product
          has no published contact address and no in-app account-deletion
          control, a request to access, correct, or erase the account record
          itself cannot be completed from the current interface. That process
          needs the operator to publish a contact method and a deletion
          procedure.
        </p>
      </PageSection>
    </PublicPage>
  );
}
