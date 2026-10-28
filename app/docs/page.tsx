import type { Metadata } from "next";
import { PageSection, PublicPage } from "@/app/site-chrome";

export const metadata: Metadata = {
  title: "API documentation",
  description:
    "How to call a SheetAPI endpoint: bearer authentication, filters, pagination, writes, errors, and worksheet limits.",
};

const EXAMPLE_KEY = "sk_live_example_not_a_real_key";

export default function DocsPage() {
  return (
    <PublicPage
      title="API documentation"
      lede="This page describes the public API implemented in the current application. Examples use a fake key and placeholder values."
    >
      <PageSection id="setup" title="Create an API">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Create an account and sign in.</li>
          <li>
            Connect Google. The app requests only the{" "}
            <code>drive.file</code> scope, then you pick a spreadsheet.
          </li>
          <li>Save that spreadsheet from the dashboard.</li>
          <li>
            Create an API for one worksheet. The URL slug is lowercase letters,
            numbers, and single hyphens, up to 64 characters.
          </li>
          <li>
            Create an API key and copy the secret. It is shown once and starts
            with <code>sk_live_</code>. The dashboard later shows a prefix, not
            the secret.
          </li>
        </ol>
        <p>
          The public URL is <code>{"{APP_URL}/api/v1/{slug}"}</code>.{" "}
          <code>APP_URL</code> is the site origin configured for that
          deployment, with no trailing slash.
        </p>
      </PageSection>

      <PageSection id="auth" title="Authentication">
        <p>
          Send the key on every data request. Query-string keys are not
          accepted.
        </p>
        <CodeBlock>{`Authorization: Bearer ${EXAMPLE_KEY}`}</CodeBlock>
        <p>
          A missing key returns 401 <code>INVALID_API_KEY</code> with the
          message &quot;A valid API key is required.&quot; A malformed, unknown,
          or revoked key returns the same status with &quot;The API key is
          invalid or revoked.&quot; A valid key for a disabled API returns 403{" "}
          <code>API_DISABLED</code>.
        </p>
      </PageSection>

      <PageSection id="methods" title="Endpoint">
        <p>
          One route handles the API. Supported methods are GET, POST, PUT,
          PATCH, DELETE, and OPTIONS. There is no separate search, sort, or
          bulk endpoint.
        </p>
        <CodeBlock>GET /api/v1/products</CodeBlock>
        <p>
          GET returns a JSON array. Cell values are strings, including numbers
          from the sheet. The header row becomes the object keys. A blank
          header cell is named <code>Column 1</code>, <code>Column 2</code>,
          and so on. A repeated header becomes <code>name</code>, then{" "}
          <code>name 2</code>.
        </p>
        <CodeBlock>{`[
  {
    "name": "Pen",
    "price": "20"
  }
]`}</CodeBlock>
        <p>
          The array is the whole success body. It is not wrapped in{" "}
          <code>success</code> or pagination fields. Responses use{" "}
          <code>Cache-Control: no-store</code> and allow cross-origin browser
          calls with <code>Authorization</code> and <code>Content-Type</code>.
        </p>
      </PageSection>

      <PageSection id="filters" title="Filters and pagination">
        <p>
          Every filter clause must match. <code>limit</code> and{" "}
          <code>offset</code> are pagination, not column names. <code>q</code>{" "}
          is a reserved case-sensitive search across every column. A column
          named <code>limit</code>, <code>offset</code>, or <code>q</code>{" "}
          cannot be filtered. Repeating a parameter, sending an empty value, or
          naming a column that is not in the header returns 400{" "}
          <code>INVALID_INPUT</code>.
        </p>
        <CodeBlock>GET /api/v1/products?name=Pen&amp;price=20&amp;limit=1&amp;offset=0</CodeBlock>
        <p>
          <code>column=value</code> is an exact, case-sensitive comparison.
          An asterisk in that value is a literal character. These parameters
          instead compare one column:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code>column__contains</code> and <code>column__icontains</code>:
            substring, case-sensitive or case-insensitive.
          </li>
          <li>
            <code>column__starts</code> and <code>column__istarts</code>:
            prefix.
          </li>
          <li>
            <code>column__ends</code> and <code>column__iends</code>: suffix.
          </li>
          <li>
            <code>column__wildcard</code>: <code>*</code> matches any sequence,
            including an empty one.
          </li>
        </ul>
        <p>
          If a header key is exactly <code>name__contains</code>, that
          parameter stays an exact filter. The suffix is used only when the
          full parameter is not itself a header. Case-insensitive operators
          use simple Unicode lowercasing, not the spreadsheet locale.{" "}
          <code>q=pen</code> matches a row when any cell contains{" "}
          <code>pen</code>. It is case-sensitive, <code>*</code> is literal,
          and it is combined with the other clauses using AND.
        </p>
        <CodeBlock>{`GET /api/v1/products?name__contains=pen&city__istarts=lon
GET /api/v1/products?q=pen&name=Pen&limit=1&offset=0
GET /api/v1/products?name__wildcard=p%2An
GET /api/v1/products?note__wildcard=%5C%2A
GET /api/v1/products?note__wildcard=%5C%5C`}</CodeBlock>
        <p>
          After URL decoding, <code>\*</code> in a wildcard is a literal
          asterisk and <code>\\</code> is a literal backslash. A backslash
          before any other character is kept as a backslash. In a URL, encode{" "}
          <code>\</code> as <code>%5C</code> and <code>*</code> as{" "}
          <code>%2A</code> when it must be literal. <code>%5C%2A</code> is the
          decoded pattern <code>\*</code>. <code>%5C%5C</code> is the decoded
          pattern <code>\\</code>.
        </p>
        <p>
          <code>limit</code> defaults to 10000 and must be a whole number from
          1 to 10000. <code>offset</code> defaults to 0 and must be a whole
          number from 0 through the largest safe integer. Invalid pagination
          is rejected before filter errors. Filters and <code>q</code> run
          before pagination. The page is a slice of the matching rows. There
          is no sort parameter. The playground sends one exact{" "}
          <code>column/value</code> filter and does not send these operators.
        </p>
      </PageSection>

      <PageSection id="writes" title="Writes">
        <p>
          POST, PUT, and PATCH require <code>Content-Type: application/json</code>{" "}
          and a JSON object. Arrays, null, and other bodies are rejected. The
          body must be at most 1,000,000 bytes and must contain at least one
          field. Unknown fields are rejected. String, finite number, and
          boolean values are accepted and stored in the sheet as text. A
          boolean becomes <code>TRUE</code> or <code>FALSE</code>. A cell longer
          than 50,000 characters is rejected.
        </p>
        <p>
          POST appends a row. Omitted columns are written as empty strings.
          The response uses the row number Google reports in{" "}
          <code>updatedRange</code>. Row 1 is the header, so the first data row
          is 2.
        </p>
        <CodeBlock>{`POST /api/v1/products
Authorization: Bearer ${EXAMPLE_KEY}
Content-Type: application/json

{"name":"Notebook","price":"12"}`}</CodeBlock>
        <CodeBlock>{`201
{
  "success": true,
  "row": {
    "name": "Notebook",
    "price": "12"
  },
  "rowNumber": 3
}`}</CodeBlock>
        <p>
          PUT replaces one existing data row. Omitted columns become empty
          strings. PATCH changes only the fields you send. Both use{" "}
          <code>?rowNumber=</code>, a worksheet row number. DELETE uses the
          same query parameter and does not take a body.
        </p>
        <CodeBlock>PATCH /api/v1/products?rowNumber=2</CodeBlock>
        <CodeBlock>{`200
{
  "success": true,
  "row": {
    "name": "Pen",
    "price": "25"
  },
  "rowNumber": 2
}`}</CodeBlock>
        <CodeBlock>{`DELETE /api/v1/products?rowNumber=3

200
{
  "success": true,
  "deleted": true,
  "rowNumber": 3
}`}</CodeBlock>
        <p>
          <code>rowNumber</code> must appear once. Row 1 is rejected. A row
          that is not a current data row returns 400. Writes do not create
          columns. A sheet that already has 10,000 data rows rejects POST
          before Google is changed.
        </p>
      </PageSection>

      <PageSection id="limits" title="Worksheet limits">
        <p>
          A public read requests columns A through GS and rows 1 through 10002.
          Supported data is 10,000 rows, 200 columns, and 50,000 characters per
          cell. Row 10002 and column GS are probes. If the sheet is past a
          limit, the API returns 413 <code>WORKSHEET_TOO_LARGE</code> and no
          row data. Content that starts only after an empty probe is outside
          the read. A blank row between data rows still counts.
        </p>
      </PageSection>

      <PageSection id="errors" title="Errors and rate limits">
        <p>
          Errors use this shape. Success responses for GET do not.
        </p>
        <CodeBlock>{`{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "This API was not found."
  }
}`}</CodeBlock>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-900">
                <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Code</th>
                <th scope="col" className="py-2 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              <ErrorRow status="400" code="INVALID_INPUT" when="The query, row number, or JSON body is not valid." />
              <ErrorRow status="401" code="INVALID_API_KEY" when="The key is missing, malformed, unknown, or revoked." />
              <ErrorRow status="403" code="API_DISABLED" when="The key is valid and the API is disabled." />
              <ErrorRow status="404" code="NOT_FOUND" when="The slug is missing or not a valid API slug." />
              <ErrorRow status="404" code="SPREADSHEET_NOT_FOUND" when="The saved spreadsheet selection was disconnected, or Google reports the file missing." />
              <ErrorRow status="404" code="WORKSHEET_NOT_FOUND" when="The configured worksheet is gone." />
              <ErrorRow status="413" code="WORKSHEET_TOO_LARGE" when="The sheet, or a write that would pass the row, column, or cell limit, is too large." />
              <ErrorRow status="429" code="RATE_LIMITED" when="The caller exceeded the rate limit. Retry-After is set." />
              <ErrorRow status="503" code="GOOGLE_NOT_CONNECTED" when="The account has no usable Google connection." />
              <ErrorRow status="503" code="GOOGLE_REAUTH_REQUIRED" when="Google needs the account to reconnect." />
              <ErrorRow status="503" code="GOOGLE_UNAVAILABLE" when="Google or the network did not complete the request." />
              <ErrorRow status="500" code="INTERNAL_ERROR" when="The request failed for another reason." />
            </tbody>
          </table>
        </div>
        <p>
          In production, each API key is limited to 120 requests per minute.
          Requests with no usable bearer credential share one bucket until a
          trusted reverse proxy is configured. Development servers use a higher
          limit so local testing is possible. That higher limit is not the
          production contract. Sign-in, registration, and password reset are
          limited separately and are not part of <code>/api/v1</code>.
        </p>
      </PageSection>

      <PageSection id="not-implemented" title="Not implemented">
        <p>
          The API does not offer sorting, numeric or date comparisons, a primary
          key, file upload, webhooks, or a query-string API key. Sheet rows are
          not stored in SheetAPI&apos;s database. A PATCH does not lock the row.
          Two appends that both see 9,999 data rows can both pass the pre-check,
          and one of them can land on the probe row. That response is 413 even
          though Google already wrote the row.
        </p>
      </PageSection>
    </PublicPage>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm leading-6 text-slate-100">
      <code>{children}</code>
    </pre>
  );
}

function ErrorRow({
  status,
  code,
  when,
}: {
  status: string;
  code: string;
  when: string;
}) {
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-2 pr-4">{status}</td>
      <th scope="row" className="py-2 pr-4 font-mono text-xs font-medium text-slate-900">
        {code}
      </th>
      <td className="py-2">{when}</td>
    </tr>
  );
}
