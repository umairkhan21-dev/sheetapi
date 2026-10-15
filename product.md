# SheetAPI --- Product Specification & Full Project Roadmap

## 1. Product Overview

**SheetAPI** is a SaaS platform inspired by Sheet Best.

The core product allows a user to connect a Google Spreadsheet and
expose spreadsheet data through a simple REST API without building a
custom backend.

The spreadsheet remains the source of truth. Our application stores
account, connection, API configuration, authentication, access-control,
and usage metadata rather than copying the entire spreadsheet into
MySQL.

### Core value proposition

> Connect a spreadsheet → select the data → generate an API → use it
> from any website, app, or service.

### Primary users

-   Developers who need a lightweight backend for small projects
-   No-code/low-code builders
-   Frontend developers who need a quick API
-   Small businesses using Google Sheets as their database
-   Students and hobby developers
-   Internal teams building prototypes

### Product principles

1.  Keep the first version simple.
2.  Google Sheets remains the source of truth.
3.  Do not unnecessarily duplicate spreadsheet rows in MySQL.
4.  Security must be designed before public API exposure.
5.  Build backend functionality first, then dashboard UI.
6.  Every major milestone should be independently testable.
7.  Prefer a coherent milestone implementation over many tiny unrelated
    changes.
8.  AI is optional and secondary; the core product is
    spreadsheet-to-REST-API infrastructure.

------------------------------------------------------------------------

# 2. Product Scope

## MVP

The MVP must allow a user to:

1.  Create an account.
2.  Log in and log out.
3.  Connect Google Sheets.
4.  See spreadsheets available to the connected Google account.
5.  Select a spreadsheet.
6.  Select a worksheet/tab.
7.  Read spreadsheet data.
8.  Configure a generated API.
9.  Generate an API key.
10. Call the generated REST endpoint.
11. Search/filter/paginate records.
12. View API documentation/examples.
13. Revoke/regenerate API keys.
14. Disconnect Google.
15. Manage their API configurations from a dashboard.

## Post-MVP

Later versions can add:

-   POST/PUT/PATCH/DELETE
-   Advanced filters
-   Sorting
-   Field selection
-   Caching
-   Rate limits
-   Usage analytics
-   API request logs
-   Webhooks
-   CSV upload
-   Excel upload
-   Multiple Google accounts
-   Team/workspace support
-   Billing/subscriptions
-   Custom domains
-   API versioning
-   OpenAPI export
-   SDK generation
-   Scheduled sync
-   More spreadsheet providers

------------------------------------------------------------------------

# 3. Technology Stack

## Frontend and backend

-   Next.js
-   TypeScript
-   App Router
-   React
-   Tailwind CSS
-   Next.js Route Handlers

There will be **no separate Express backend** in the initial
architecture.

Next.js handles both:

-   Browser pages
-   Server-side API routes

## Database

-   MySQL/MariaDB
-   Prisma ORM

The current local environment uses XAMPP/MariaDB.

## Authentication

Application authentication:

-   Email/password
-   bcrypt password hashing
-   HTTP-only JWT cookie
-   HS256 signing using Node's built-in crypto
-   7-day session expiration
-   Forgot password / password reset
    -   Cryptographically random reset tokens from Node's `crypto` module
    -   Only a SHA-256 hash of the token is stored
    -   Tokens expire after 1 hour
    -   Tokens are single-use
    -   A new reset request invalidates older unused tokens for that user
    -   The API does not reveal whether an email address exists
    -   A successful reset records `passwordChangedAt` and rejects JWTs issued before that time

Optional future authentication:

-   Sign in with Google

Important distinction:

**Google Sheets OAuth is not the same thing as Sign in with Google.**

The initial Google OAuth flow exists to connect a user's Google
Drive/Sheets data after they are logged into SheetAPI.

## Google APIs

Initial Google integration:

-   Google OAuth 2.0
-   Google Drive API
-   Google Sheets API

Initial scope:

`https://www.googleapis.com/auth/drive.file`

The narrow scope is intentional.

------------------------------------------------------------------------

# 4. High-Level Architecture

``` text
                    ┌──────────────────────┐
                    │      User Browser    │
                    │  Next.js React UI    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │      Next.js App      │
                    │ Pages + Route Handler │
                    └───────┬───────┬──────┘
                            │       │
                 ┌──────────┘       └─────────────┐
                 ▼                                ▼
        ┌─────────────────┐              ┌──────────────────┐
        │ MySQL / MariaDB │              │ Google APIs      │
        │ via Prisma      │              │ Drive + Sheets   │
        └─────────────────┘              └──────────────────┘
                 ▲                                ▲
                 │                                │
                 └────────── API Configuration ───┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ Generated REST   │
                         │ API              │
                         └────────┬─────────┘
                                  │
                                  ▼
                         Developer's App
```

------------------------------------------------------------------------

# 5. Data Ownership Model

Google Sheets owns the actual spreadsheet data.

MySQL owns application metadata.

## Google Sheets

Contains:

-   Columns
-   Rows
-   Cell values
-   Worksheets

## MySQL

Contains:

-   User accounts
-   Password reset token hashes
-   Google connections
-   API configurations
-   API keys
-   Usage data
-   Request logs
-   Billing data later
-   Access settings
-   Caching metadata later

This prevents the initial system from becoming a spreadsheet replication
database.

------------------------------------------------------------------------

# 6. Current Project State

## Completed

### Project foundation

-   Next.js project created
-   TypeScript configured
-   Tailwind configured
-   App Router configured
-   MySQL/MariaDB connected
-   Prisma configured
-   Prisma 7 MariaDB adapter configured
-   Initial migration applied

### Application authentication

Completed:

-   Registration backend
-   Login backend
-   Logout backend
-   Current-user endpoint
-   JWT authentication
-   HTTP-only cookie
-   bcrypt password hashing
-   Input validation
-   Duplicate email protection
-   Password hash never returned
-   Token never returned to browser JSON
-   Protected route helper
-   Forgot password
-   Password reset
-   Reset tokens stored only as SHA-256 hashes
-   Single-use, expiring reset tokens
-   Older unused reset tokens invalidated by a new request
-   Sessions issued before a password change are rejected

Existing routes:

``` text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

Password reset pages:

``` text
/forgot-password
/reset-password
```

Password reset email uses SMTP when configured. In local development, if SMTP is not configured, the message is written to `tmp/dev-mail/` so the flow can be tested. That directory is gitignored. Production does not write it and does not log the raw reset token.

Required environment variables for real email delivery:

``` text
APP_URL
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
EMAIL_FROM
```

`APP_URL` defaults to `http://localhost:3000` outside production. `SMTP_USER` and `SMTP_PASSWORD` are both required when the SMTP server uses authentication, and both omitted for an open local relay.

### Google connection backend

Completed:

``` text
GET /api/auth/google
GET /api/auth/google/callback
```

The OAuth flow:

``` text
Logged-in user
      ↓
Connect Google Sheets
      ↓
Google authorization
      ↓
Google callback
      ↓
Exchange authorization code
      ↓
Get Google Drive permission ID
      ↓
Store GoogleConnection
      ↓
Return to dashboard
```

### Google connection database model

A `GoogleConnection` model has been added with:

-   userId
-   googleAccountId
-   accessToken
-   refreshToken
-   expiresAt
-   createdAt
-   updatedAt

The connection is one-to-one with the application user.

Reconnect updates the existing connection.

Old refresh tokens are preserved when Google does not return a
replacement.

### Homepage

Current landing page exists with:

-   Navbar
-   Hero
-   API preview
-   How-it-works section
-   Footer
-   Dashboard link
-   Login link
-   Get Started links

### Dashboard

The signed-in dashboard is a single application shell:

-   Left sidebar on desktop
-   Top header with the signed-in name, email, and logout
-   Main content area
-   Menu button for narrow screens
-   The active section is highlighted

Routes:

``` text
/dashboard
/dashboard/apis
/dashboard/apis/new
/dashboard/apis/{apiId}
/dashboard/sheets
/dashboard/settings
```

`/dashboard` is the overview. It shows a short welcome, Google connection status, the signed-in user's API count, and shortcuts. Google OAuth still returns here, including the connected and error messages.

`/dashboard/apis` lists that user's API configurations. Each row can rename the display name, enable or disable the API, or delete it. Create API opens `/dashboard/apis/new`. `/dashboard/apis/{apiId}` shows one API the user owns: endpoint URL, linked spreadsheet and worksheet, API keys, the worksheet preview, and the same rename, enable, disable, and delete actions. Another user's API id returns the not-found page.

`/dashboard/sheets` has the Google connection, spreadsheet picker, available spreadsheets, Select, Open, Disconnect, worksheet tabs, and the table/JSON preview. Disconnect removes that user's saved spreadsheet selection after confirmation. It does not delete or edit the Google spreadsheet.

`/dashboard/settings` shows the account name, email, logout, and the existing Google connect or reconnect action. When Google is connected, it also offers Disconnect Google account. The same action is next to the connection status on the overview and Google Sheets pages.

A signed-out visit to `/dashboard` still shows the sign-in message and any Google connection error. Other dashboard routes redirect to `/login`. No database migration was added for this UI.

### Spreadsheet listing

Completed:

``` text
GET /api/google/sheets
```

The endpoint requires the SheetAPI session, loads that user's
`GoogleConnection`, and lists spreadsheet metadata from the Google
Drive API. The dashboard shows "Your spreadsheets" after Google is
connected, including loading, empty, and error states.

Returned fields are spreadsheet id, name, and modified time. Access
tokens and refresh tokens are not returned.

If the stored access token is expired and a refresh token exists, the
server refreshes it with Google's token endpoint and updates
`GoogleConnection` before calling Drive.

OAuth scope remains:

`https://www.googleapis.com/auth/drive.file`

That scope does not list every spreadsheet in the user's Drive. The
Drive API returns only spreadsheets this app can already access.

### Google Picker

Implemented. A connected user can choose an existing spreadsheet from
the dashboard. The scope was not broadened.

``` text
GET  /api/google/picker
GET  /api/google/sheets/selection
POST /api/google/sheets/selection
DELETE /api/google/sheets/selection/:spreadsheetId
DELETE /api/auth/google
```

Google Picker runs in the browser. `drive.file` requires
`PickerBuilder.setAppId` with the Cloud project number, and
`setOAuthToken` requires the current access token in that browser
session. The refresh token and client secret stay on the server. The
access token is not logged or stored in `localStorage`. The browser
sends only the spreadsheet ID. The server loads that file with the
stored Google connection, checks that it is a spreadsheet this app can
access, and then saves the ID, name, and modified time on
`SelectedSpreadsheet`. Spreadsheet rows are not stored.

Manual Google Cloud setup:

-   Enable the Google Picker API
-   Create a browser API key
-   If the key is restricted to websites, allow the app origin and
    `https://docs.google.com/*`
-   If the key is restricted to APIs, allow the Google Picker API
-   Set `GOOGLE_PICKER_API_KEY`
-   Set `GOOGLE_APP_ID` to the Cloud project number when it should not
    be taken from the numeric prefix of `GOOGLE_CLIENT_ID`

### Worksheet preview

Implemented for a spreadsheet already saved on `SelectedSpreadsheet`.
Spreadsheet rows stay in Google Sheets.

``` text
GET /api/google/sheets/:spreadsheetId
GET /api/google/sheets/:spreadsheetId/preview?sheetId=
```

The first route returns the spreadsheet id, name, and worksheet tabs.
The preview route reads one worksheet with the user's stored Google
connection, refreshes an expired access token when a refresh token
exists, and returns the header row plus data rows as strings. The
dashboard shows those rows as a table and as JSON. The preview is
limited to 100 data rows and 50 columns. Nothing from the sheet is
written to MySQL.

The existing Select button still saves a spreadsheet. After that save,
and from Open on a chosen spreadsheet, the dashboard loads the
worksheet tabs.

The Google Sheets API must be enabled in the same Cloud project. The
OAuth scope is unchanged.

### API configuration and public read

Implemented. An authenticated user can create one API configuration
for a spreadsheet already saved on `SelectedSpreadsheet` and one of
that spreadsheet's worksheets. Spreadsheet rows stay in Google Sheets.

``` text
POST /api/apis
GET  /api/v1/{slug}
```

`POST /api/apis` requires the SheetAPI session. It checks that the
spreadsheet is saved for the current user, that the worksheet id
exists on that spreadsheet, and that the endpoint slug is not already
used. Slugs are globally unique because the public URL has no user
segment. The handler stores the API name, normalized slug, Google
spreadsheet id, worksheet id, and worksheet title. It does not store
rows, access tokens, or refresh tokens. New configurations are
`ACTIVE`.

The Create API form is at `/dashboard/apis/new`. The user chooses a
saved spreadsheet, chooses a worksheet, enters a name, and can enter a
slug. A blank slug is generated from the name. The success state shows
the API name, spreadsheet, worksheet, and URL, with a link to that
API's page.

``` text
GET /api/v1/products
```

returns the worksheet as a JSON array of string-valued objects. The
read uses the configuration owner's stored Google connection and the
spreadsheet id stored on the configuration. Callers cannot substitute
another spreadsheet id. A missing configuration returns 404. A
`DISABLED` configuration returns 403 and no rows. If the saved
spreadsheet selection has been removed, the route returns 404
`SPREADSHEET_NOT_FOUND` and no rows. If the owner has no Google
connection, it returns 503 `GOOGLE_NOT_CONNECTED` and tells the caller
to reconnect Google Sheets. It does not return rows from another
spreadsheet.

`GET /api/v1/{slug}` requires `Authorization: Bearer <key>`. The
response is not cached (`Cache-Control: no-store`).
The public read is not limited to the dashboard preview of 100 rows
and 50 columns. It rejects a worksheet above 10,000 data rows, 200
columns, or 50,000 characters in one cell instead of returning a
partial body.

Migration `20261012080933_add_api_configuration` creates `Api` and was
applied to the local MariaDB database. The database was not reset.

Files created:

``` text
prisma/migrations/20261012080933_add_api_configuration/migration.sql
lib/api-config.ts
lib/api-config.test.ts
lib/google-worksheets.records.test.ts
lib/public-api-error.ts
lib/public-api-error.test.ts
app/api/apis/route.ts
app/api/v1/[slug]/route.ts
app/dashboard/create-api-form.tsx
```

Files modified:

``` text
prisma/schema.prisma
lib/google-worksheets.ts
app/dashboard/page.tsx
product.md
```

Create request:

``` http
POST /api/apis
Content-Type: application/json
```

``` json
{
  "name": "Products API",
  "slug": "products",
  "spreadsheetId": "spreadsheet-id",
  "worksheetId": 0
}
```

`slug` may be omitted. `worksheetId` is the Google sheet id, not a
title supplied by the browser.

Create response:

``` json
{
  "success": true,
  "api": {
    "id": 1,
    "name": "Products API",
    "slug": "products",
    "spreadsheetId": "spreadsheet-id",
    "spreadsheetName": "Products",
    "worksheetId": 0,
    "worksheetName": "Sheet1",
    "status": "ACTIVE",
    "url": "http://localhost:3000/api/v1/products",
    "createdAt": "2026-10-12T00:00:00.000Z"
  }
}
```

Public response:

``` json
[
  {
    "id": "1",
    "name": "Pen",
    "price": "20"
  }
]
```

Error response:

``` json
{
  "success": false,
  "error": {
    "code": "SLUG_TAKEN",
    "message": "That endpoint slug is already in use. Choose another."
  }
}
```

Checks run for this milestone:

-   `npx tsc --noEmit` passed
-   `npm run lint` passed
-   `npx tsx --test` on the API configuration, worksheet record, and
    public error tests passed: 18 tests
-   HTTP checks passed for signed-out creation, invalid input, an
    unsaved spreadsheet, another user's spreadsheet, a duplicate slug,
    a disabled API, an enabled API with no Google connection, a removed
    spreadsheet selection, and Google authorization failure. The
    authorization failure did not create a row
-   Mocked worksheet tests covered an empty sheet, a header-only sheet,
    a missing worksheet id, values longer than the preview cell cap,
    and more than 100 rows
-   A live Google read passed. `GET /api/v1/{slug}` returned
    `application/json`, 4 objects, and the same JSON as a direct
    Google Sheets read of that saved worksheet. The temporary
    configuration was deleted afterward
-   The dashboard was exercised in the browser: signed-out state,
    login, worksheet loading, invalid slug, success state, duplicate
    slug, the existing worksheet preview, logout, and a 390px-wide
    layout
-   After the temporary account was removed, the generated URL
    returned 404

A live empty worksheet and a live unknown worksheet id were not
executed against Google. Those cases were covered with mocked Google
responses. The fake-token HTTP check covered an authorization failure,
not a successful metadata response that omits the worksheet.

### Audit on 12 October 2026

The API configuration and generated GET were checked again against
the code, MySQL, and the running local app. No product code was
changed.

Verified:

-   `POST /api/apis` requires a SheetAPI session and writes an `Api`
    row through Prisma. A live create stored the signed-in user's id,
    the saved spreadsheet id, the Google worksheet id, and the
    worksheet title returned by Google. The temporary row was deleted
    after the check.
-   `Api.slug` has a unique index. Names and slugs are validated and
    normalized. A duplicate slug returns 409 and does not create a
    second row.
-   `GET /api/v1/{slug}` loads that row and reads only its stored
    spreadsheet id and worksheet id. A `spreadsheetId` query parameter
    did not change the response.
-   That live response was `application/json`, an array of 3 objects
    with 4 columns, and the same JSON as a direct Google Sheets read
    of the configured worksheet. The handler has no hardcoded rows.
-   An unknown or invalid slug returns 404. A disabled configuration
    returns 403 and no rows. An enabled configuration with no Google
    connection returns 503. A stored access token Google rejects, with
    no refresh token, returns 503 `GOOGLE_REAUTH_REQUIRED` and no rows.
    A removed spreadsheet selection returns 404. These responses do
    not include Google tokens.
-   `POST /api/apis` returns 401 without a session and 404 when the
    spreadsheet is not saved for that user, including when the id
    belongs to another user. No `Api` row is created in those cases.
-   Create and public responses do not include access tokens, refresh
    tokens, or the client secret. Those routes log error names and
    Google status kinds, not credential values.
-   `npx tsc --noEmit`, `npm run lint`, and the 18 existing API tests
    passed.

Not implemented:

-   At the time of this audit, API key generation, storage, and
    verification were not present. There was no `ApiKey` model, no key
    route, and `GET /api/v1/{slug}` did not read an `Authorization`
    header.
-   Dashboard routes to list, disable, rename, or delete an API
    configuration. `DISABLED` is enforced when present in MySQL, and
    the dashboard cannot set it yet.
-   A live Google `invalid_grant` refresh failure was not triggered
    on the real connection.

No defect was found in the implemented create or read path at the
time of that audit. API key enforcement was added afterward.

### API keys

Implemented. Each API can have named keys. The database stores a
SHA-256 hash and a short display prefix. The raw key is returned only
by the create response, and the dashboard shows it only until the user
leaves or reloads the page.

``` text
GET  /api/apis
GET  /api/apis/{apiId}/keys
POST /api/apis/{apiId}/keys
POST /api/apis/{apiId}/keys/{keyId}/revoke
```

All four routes require the SheetAPI session. The API id must belong
to the signed-in user. Another user's API returns 404 for list,
create, and revoke. Key names use the same 80-character rules as API
names. The server generates the key. A key supplied by the client is
ignored.

A new key looks like `sk_live_` followed by 32 bytes of
`crypto.randomBytes` encoded as base64url. The stored prefix is
`sk_live_` plus the first 8 characters of that random portion. The
hash is 64 lowercase hex characters. Responses do not include
`keyHash`, Google tokens, or the raw key except for the one create
response.

`GET /api/v1/{slug}` reads the key only from the `Authorization`
header. A missing key returns 401 `INVALID_API_KEY` with "A valid API
key is required." A malformed, unknown, revoked, or other-API key
returns 401 `INVALID_API_KEY` with "The API key is invalid or
revoked." A query parameter is not accepted. These rejections happen
before the saved-spreadsheet check and before any Google Sheets read.

A valid key for a `DISABLED` API returns 403 and no rows. A valid key
for an enabled API still requires the saved spreadsheet and the
owner's Google connection. `lastUsedAt` is set only after those checks
pass and before the worksheet read. Revoking a key sets `revokedAt`.
Revoking it again returns the same revoked record.

Migration `20261012110550_add_api_key` creates `ApiKey` with a unique
index on `keyHash`, an index on `apiId`, and a cascading foreign key
to `Api`. It was applied to the local MariaDB database. The database
was not reset. Key expiration is not stored yet.

Files created:

``` text
prisma/migrations/20261012110550_add_api_key/migration.sql
lib/api-key.ts
lib/api-key.test.ts
lib/api-key-store.ts
lib/api-key.access.test.ts
lib/api-management-response.ts
app/api/apis/[apiId]/keys/route.ts
app/api/apis/[apiId]/keys/[keyId]/revoke/route.ts
app/dashboard/api-created.ts
app/dashboard/api-keys.tsx
```

Files modified:

``` text
prisma/schema.prisma
lib/public-api-error.ts
app/api/apis/route.ts
app/api/v1/[slug]/route.ts
app/dashboard/create-api-form.tsx
app/dashboard/page.tsx
product.md
```

Create request:

``` http
POST /api/apis/1/keys
Content-Type: application/json
```

``` json
{
  "name": "Website"
}
```

Create response:

``` json
{
  "success": true,
  "key": {
    "id": 1,
    "name": "Website",
    "keyPrefix": "sk_live_abc12345",
    "secret": "sk_live_abc12345example",
    "createdAt": "2026-10-12T00:00:00.000Z",
    "lastUsedAt": null,
    "revokedAt": null
  }
}
```

`secret` is the raw key and is not returned again. List responses
contain `id`, `name`, `keyPrefix`, `createdAt`, `lastUsedAt`, and
`revokedAt`.

Public request:

``` http
GET /api/v1/products
Authorization: Bearer sk_live_example
```

API keys are managed on `/dashboard/apis/{apiId}`. That page can create
a named key, show the full key once with a copy button and a warning,
list prefixes and status, and revoke a key after confirmation. A reload
does not show the raw key again.

Checks run for this milestone:

-   `npx tsc --noEmit` passed
-   `npm run lint` passed
-   `npx tsx --test` on the API key, API configuration, worksheet
    record, and public error tests passed: 25 tests
-   The local `ApiKey` table has the expected columns, the unique
    `keyHash` index, and the `apiId` index
-   HTTP checks passed for signed-out listing, owner listing, another
    user's list/create/revoke, an invalid key name, one-time secret
    creation, prefix-only listing, a missing key, a query-string key,
    a valid key with no saved spreadsheet, and revocation
-   A live Google read passed. `GET /api/v1/{slug}` without a key
    returned 401. The same URL with that API's bearer key returned
    `application/json` and the same JSON as a direct Google Sheets
    read: 3 rows. The temporary configuration and key were deleted
-   The dashboard was exercised in the browser: login, the existing
    Create API empty state, an empty key list, creation, the one-time
    warning, the copy button, prefix-only listing, canceling
    revocation, confirming revocation, and a reload that did not show
    the full key
-   In that browser, clipboard access was blocked. The page showed the
    manual-copy message and left the key in the field
-   Temporary HTTP and browser accounts were deleted afterward

------------------------------------------------------------------------

### Dashboard navigation

Implemented. The signed-in dashboard is no longer one stacked page.
Overview, My APIs, Google Sheets, API details, and Settings use the
shell described in the Dashboard section above. Existing authentication,
Google OAuth, spreadsheet selection, worksheet preview, API creation,
public reads, API-key hashing, and revocation are unchanged. Usage
counts, billing, pagination, search, and filtering were not added.

Checks run for this milestone:

-   `npx tsc --noEmit` passed
-   `npm run lint` passed
-   The browser covered signed-out `/dashboard`, registration, login,
    logout, redirect from a protected dashboard route to `/login`,
    overview API count, settings, Google Sheets connection status,
    saved and available spreadsheet lists, Select, Open, worksheet
    tabs, and the table/JSON preview
-   Creating an API, creating a key, reading `/api/v1/{slug}` with that
    key, and revoking the key were checked against the same endpoints
    the dashboard uses. The list response did not include the raw key.
    The temporary API, key, and browser account were deleted afterward
-   A narrow layout showed the menu, active item, user, and logout. A
    wide layout showed the sidebar and active item

### Delete API

Implemented. My APIs has a Delete action on each row, and the API
details page has Delete API. Both open a confirmation dialog that
states the Google spreadsheet and worksheet are not deleted. Confirming
sends `DELETE /api/apis/{apiId}`.

The route requires the SheetAPI session. It deletes one API only when
the id belongs to that user. `ApiKey.apiId` uses `ON DELETE CASCADE`,
so the API's keys are removed with the configuration. Saved spreadsheet
rows, Google connections, and other APIs are not deleted. A missing
configuration makes `GET /api/v1/{slug}` return 404 before any
spreadsheet read. Another user's id and an unknown id both return 404.
An invalid id returns 404. A signed-out request returns 401. The delete
and cancel buttons stay disabled while the request is in progress.

Checks run for this feature:

-   `npx tsc --noEmit` passed
-   `npm run lint` passed
-   `npx tsx --test` passed for the delete test and the existing API
    key, API configuration, worksheet record, and public error tests
-   A signed-in user deleted their own API. A second simultaneous
    delete of that same id returned 404. The API row and its key hash
    were gone. The saved spreadsheet row remained
-   `GET /api/v1/{slug}` with the deleted key returned 404 and no rows.
    The deleted key no longer authenticated against another API
-   Another user received 404 and the API remained. Signed-out delete
    returned 401 and the API remained. `nope`, `0`, `1.5`,
    `9999999999`, and a missing numeric id returned 404
-   The owner's other API and the other user's API still accepted
    their keys. Those accounts have no Google connection, so the public
    read returned 503 `GOOGLE_NOT_CONNECTED` after the key was accepted
-   On the Google-connected account, a temporary API for an existing
    worksheet returned that worksheet's JSON. After
    `DELETE /api/apis/{apiId}`, the same URL returned 404. A direct
    Google Sheets read of that worksheet had the same SHA-256 JSON hash
    before and after. The saved spreadsheet row was unchanged. Another
    API for that worksheet still returned the same JSON with its own
    key. The temporary API and the extra key were removed
-   In the browser, Cancel left the API in the list. Confirming showed
    "Deleting…" with the actions disabled, then the success message and
    the remaining API. Delete API on the details page did the same and
    left the empty list. The dialog says the Google spreadsheet and
    worksheet are not deleted. The disposable account's spreadsheet row
    was still present after both APIs were gone, and that account was
    then deleted
-   The two deleted browser slugs returned 404
    `{"success":false,"error":{"code":"NOT_FOUND","message":"This API was not found."}}`

A database failure during delete was not triggered. The route returns
500 `INTERNAL_ERROR` for that case. The browser was not used to display
a failed delete; the 401 and 404 responses were checked over HTTP.

### Rename and enable/disable

Implemented. My APIs has Rename and Enable or Disable on each row. The
API details page has the same actions. Rename changes only the display
name. The endpoint slug, spreadsheet, worksheet, and API keys stay the
same. Disable sets `Api.status` to `DISABLED`. Enable sets it back to
`ACTIVE`.

``` text
PATCH /api/apis/{apiId}
```

The route requires the SheetAPI session. The id must belong to that
user. Another user's id, an unknown id, and an invalid id return 404.
A signed-out request returns 401. The body must include a name, a
status, or both. A name uses the existing 80-character rules. Status
must be `ACTIVE` or `DISABLED`. Slug, spreadsheet, and worksheet fields
in the body are ignored. A blank name or any other status returns 400
and does not write. A database error returns 500 `INTERNAL_ERROR`.

`GET /api/v1/{slug}` already rejects a `DISABLED` API after the bearer
key is accepted and before any spreadsheet read. The response is 403
`API_DISABLED` with "This API is disabled." and no rows. A valid active
key works again after the API is enabled. A revoked key stays revoked.

No schema change was required. `Api.status` is already
`ACTIVE` or `DISABLED` from migration
`20261012080933_add_api_configuration`. `prisma migrate status`
reported the local MariaDB database up to date. The database was not
reset.

The rename dialog explains that the endpoint stays the same. Save shows
"Saving…" and disables the actions until the request finishes. A blank
name stays in the dialog with the validation message. Enable and
Disable show "Enabling…" or "Disabling…" and a success or error
message. The buttons stay disabled while a request is in progress.

Files created:

``` text
app/dashboard/manage-api.tsx
lib/api-manage.test.ts
```

Files modified:

``` text
app/api/apis/[apiId]/route.ts
app/dashboard/apis/page.tsx
app/dashboard/apis/[apiId]/page.tsx
app/dashboard/ui.tsx
lib/api-config.ts
lib/api-config.test.ts
lib/api-key-store.ts
product.md
```

Checks run for this feature:

-   `npx tsc --noEmit` passed
-   `npm run lint` passed
-   `npx tsx --test` on the API configuration, API management, API
    delete, API key, worksheet record, and public error tests: 28
    passed and 2 failed on the first run. The new management test that
    reads a live Google worksheet failed because the connected account
    had no existing API row. That test was changed to use a saved
    spreadsheet and then passed. The existing delete test's live Google
    case failed for the same empty-API reason and was not changed
-   `npx tsx --test lib/api-manage.test.ts` then passed: 2 tests
-   The ownership test renamed an API, confirmed the slug, spreadsheet,
    worksheet, and key hash were unchanged, rejected a signed-out
    request, another user, invalid ids, a blank name, and a bad status,
    disabled the API, and confirmed a valid key returned 403
    `API_DISABLED` with no rows and no last-used time. Re-enabling
    returned 503 `GOOGLE_NOT_CONNECTED` for that account because it has
    no Google connection. Revoke then returned 401. Delete removed the
    API and its key and left the saved spreadsheet
-   The live Google test renamed a temporary API, kept the slug and
    key, and returned the same worksheet JSON. Disabling returned 403
    and no rows. A direct Google Sheets read had the same SHA-256 JSON
    hash before, during, and after. Re-enabling returned that same JSON
    with the same key. Revoke returned 401. Delete returned 404. The
    saved spreadsheet row was unchanged
-   In the browser, a disposable account renamed an API from the list,
    canceled a rename, saw the blank-name error, and saw "Saving…" with
    the actions disabled. The endpoint slug stayed the same. Disable
    showed "Disabling…", then Disabled, and the public read with that
    API's new key returned 403 and no rows. The details page renamed
    it again without changing the URL, then Enable showed "Enabling…"
    and the same key returned 503 `GOOGLE_NOT_CONNECTED` because that
    browser account has no Google connection. Canceling revocation left
    the key active. Confirming revocation returned 401. Canceling
    delete left the API. Confirming delete showed "Deleting…" and left
    the other API in the list. The narrow layout showed Rename,
    Disable, and Delete. The wide layout showed the sidebar and one
    header row. The disposable account was deleted afterward

A database failure during rename or status change was not triggered.

### Verification pass on 14 October 2026

The implemented authentication, API key, API management, and public read
paths were exercised with automated tests. No application code was
changed. Isolated accounts were deleted afterward. The real Google Sheet
was not edited.

`npx tsc --noEmit` passed. `npm run lint` passed. `npx tsx --test lib/*.test.ts`
passed 42 tests, failed 0, and skipped 1.

The skip is the live delete case in `lib/api-delete.test.ts`. The
connected Google account had no active API with a saved spreadsheet, so
that case was skipped instead of failed. The live rename test still
created a temporary API on a readable saved spreadsheet, compared the
public JSON with a direct Google read, disabled and re-enabled it, then
deleted it. The worksheet JSON hash was the same before, during, and
after, and the saved spreadsheet row was unchanged.

A mocked Google response proved that a later worksheet snapshot is what
`GET /api/v1/{slug}` returns. That did not write to the real spreadsheet.
Successful `POST /api/apis` against Google, OAuth code exchange, and a
live `invalid_grant` on the real connection were not run in that pass.
The later verification ran the API creation against Google and an
`invalid_grant` for a refresh token that is not stored. A successful
callback code exchange still was not run.

### Google integration verification on 14 October 2026

The existing Google OAuth, Drive, Sheets, picker, selection, worksheet,
API creation, and public read paths were tested. No application code
was changed. The OAuth scope was not widened. The real spreadsheet was
not edited. Temporary users, the temporary API, and its key were
deleted. The stored Google connection's access-token hash, refresh-token
hash, and `updatedAt` were the same after the live reads.

`npx tsc --noEmit` passed. `npm run lint` passed. `npx tsx --test lib/*.test.ts`
passed 59 tests, failed 0, and skipped 1.

The skip is still the live delete case in `lib/api-delete.test.ts`.
The connected account had no active API with a saved spreadsheet after
the temporary verification API was removed.

Mocked Google responses covered:

-   Authorization-code exchange, including a response with no refresh
    token, `invalid_grant`, a network failure, invalid JSON, and a
    payload without an access token. The test client secret was not
    copied into the error.
-   Access-token refresh that keeps the previous refresh token when
    Google omits a replacement, and that stores the replacement when
    Google returns one.
-   Refresh failures for an empty token, `invalid_grant`, another OAuth
    error, a network failure, and invalid JSON. `invalid_grant` did not
    change the temporary connection row.
-   One retry after Google returns 401 for an unexpired access token.
    The new access token was stored and the refresh token stayed the
    same.
-   Spreadsheet listing with a second page, duplicate ids, non-spreadsheet
    files, trashed files, an empty list, a malformed list, 401, 403,
    500, and a network failure.
-   Spreadsheet validation for a real spreadsheet, a non-spreadsheet,
    a missing file, and malformed JSON.
-   Worksheet tabs, preview rows as strings, duplicate headers, an empty
    sheet, a missing worksheet, a preview truncated at 100 data rows, a
    mismatched spreadsheet id, a malformed values payload, 404, Sheets
    API not enabled, 500, and a network failure.
-   Worksheet error JSON that does not include a token-like message or
    a stack trace.

HTTP checks against `http://127.0.0.1:3000` covered signed-out Google
routes, OAuth state mismatch, Google denial, a missing code, duplicate
callback parameters, an oversized state, `error=server_error`, a
token-like provider error, and a `bad-code` exchange. Google rejected
that code. The redirect was `/dashboard?google=error&reason=failed`,
the state cookie was cleared, and no connection row was stored. The
redirect did not include the client secret or the code.

A temporary signed-in user could not list another user's saved
spreadsheet, open it, or preview it. Invalid ids and selection bodies
returned 400. With no Google connection, listing, picker, worksheet
open, and selection returned the existing not-connected errors. A
browser-supplied spreadsheet id was not saved when Drive rejected the
fake token. An expired fake access token and a fake refresh token made
listing and picker return 403 `GOOGLE_REAUTH_REQUIRED`; the stored fake
tokens were unchanged and were not in the response.

Live Google access, using the already connected account, covered:

-   `GET /api/google/sheets` returned 3 spreadsheets. The JSON hash
    matched a direct Drive read. Tokens were not in the response.
-   Saved spreadsheet ids from `GET /api/google/sheets/selection`
    matched the database. Picker returned a session whose access-token
    hash matched the stored token. The refresh token and client secret
    were not in that response.
-   `POST /api/google/sheets/selection` with an unknown id returned 404
    `SPREADSHEET_NOT_FOUND` and did not add a row.
-   Worksheet tabs and the preview JSON hash matched direct Sheets
    reads. An unknown worksheet id returned 404 `WORKSHEET_NOT_FOUND`.
-   `POST /api/apis` stored the worksheet title returned by Google.
    `GET /api/v1/{slug}` with that API's bearer key returned the same
    JSON hash as a direct read. After delete, the URL returned 404.
    The direct worksheet hash was the same before and after.
-   `refreshGoogleAccessToken` with a refresh token that is not the
    stored one returned `invalid_grant` (`reauthRequired`). The stored
    connection was unchanged.

A live empty worksheet was not present on the readable saved
spreadsheet. That case remains covered by the mocked preview. A
successful browser consent code was not exchanged, so the callback's
reconnect upsert did not run. The refresh helper's preservation of an
omitted refresh token was tested with a mock and a temporary database
row. The stored access token was still valid, so a live successful
refresh of that connection was not required and was not forced. The
spreadsheet list route's 401-then-success retry was not run against
Google; the shared access-token helper's retry was mocked. Picker UI
in the browser was not opened. A non-spreadsheet file was not submitted
to the selection route; the parser rejects that file type in a mock.

### Google connection management

Implemented. A signed-in user can disconnect one saved spreadsheet or
the Google account. No Prisma migration was added. `SelectedSpreadsheet`
and `GoogleConnection` are removed with `deleteMany` scoped to the
current user. API configurations, API keys, the SheetAPI account, and
other users' rows stay.

``` text
DELETE /api/google/sheets/selection/:spreadsheetId
DELETE /api/auth/google
```

Spreadsheet disconnect requires the SheetAPI session. The spreadsheet
id must be a valid Google file id. The row must belong to the current
user. Another user's id, a missing id, and an invalid id do not delete
anything. The handler does not call Google Drive, so it cannot delete
or edit the spreadsheet, its worksheets, or its rows.

APIs that pointed at the removed selection stay `ACTIVE` and keep their
keys. The dashboard shows **Spreadsheet disconnected** instead of
Active. `GET /api/v1/{slug}` returns 404 `SPREADSHEET_NOT_FOUND` with
"This API's spreadsheet selection was disconnected." and does not read
Google. Saving that spreadsheet again restores the public read. Other
saved spreadsheets keep working.

Google account disconnect also requires the SheetAPI session. It loads
only the current user's `GoogleConnection`. A `userId` in the request
body is ignored. The server revokes the refresh token when one is
stored, otherwise the access token, at
`https://oauth2.googleapis.com/revoke`. The token is not written to the
response or to logs. HTTP 200 means `revoked: true`. Any other result,
including a network failure, still deletes the local credentials and
returns `revoked: false` with a message that Google did not confirm
revocation. A missing connection returns 404 `GOOGLE_NOT_CONNECTED`.

Saved spreadsheet selections, API configurations, and API keys remain.
An active API whose spreadsheet is still saved shows **Reconnect
Google**. Its public read returns 503 `GOOGLE_NOT_CONNECTED` and
"Reconnect Google Sheets before this API can return data." It does not
return worksheet rows. Reconnect uses the existing
`GET /api/auth/google` flow, which upserts `GoogleConnection`.

The overview, Google Sheets page, and Settings page show Disconnect
Google account next to the connection status. Saved spreadsheets have a
Disconnect action. Both actions ask for confirmation, disable repeat
submission, and show a pending label. Success and error text stay on
the page. The Google result says whether revocation was confirmed.

Limitations:

-   A live Google revocation of the real stored refresh token was not
    run. Revocation success is covered by a mocked HTTP 200. The route
    test uses a fake token, so Google does not confirm revocation.
-   If Google does confirm revocation, `drive.file` access to previously
    picked files can be removed. Saved selection rows remain, and the
    user may need to choose those spreadsheets again after reconnecting.
-   A disabled API still shows Disabled. The detail page also says when
    the spreadsheet or Google account is disconnected.
-   The public legal page that explains how to disconnect Google is
    still later work.

# 7. Current Immediate Work

Application authentication, including password reset, is implemented:

``` text
/login
/register
/forgot-password
/reset-password
/dashboard
```

Spreadsheet listing, Google Picker selection, and disconnect are implemented:

``` text
GET  /api/google/sheets
GET  /api/google/picker
GET  /api/google/sheets/selection
POST /api/google/sheets/selection
DELETE /api/google/sheets/selection/:spreadsheetId
DELETE /api/auth/google
```

Worksheet selection and data preview are implemented:

``` text
GET /api/google/sheets/:spreadsheetId
GET /api/google/sheets/:spreadsheetId/preview?sheetId=
```

API configuration, hashed API keys, and a keyed public GET are
implemented:

``` text
POST /api/apis
GET  /api/apis
PATCH /api/apis/{apiId}
DELETE /api/apis/{apiId}
GET  /api/apis/{apiId}/keys
POST /api/apis/{apiId}/keys
POST /api/apis/{apiId}/keys/{keyId}/revoke
GET  /api/v1/{slug}
```

`GET /api/v1/{slug}` requires `Authorization: Bearer <key>`. The key
must belong to that API and must not be revoked. Deleting an API
removes that configuration and its keys. It does not delete the Google
spreadsheet or worksheet. A disabled API returns 403 and no rows.
Renaming changes the display name only. Do not broaden the OAuth scope.

The dashboard navigation shell is implemented. Delete, rename, enable,
and disable are implemented. Disconnecting a saved spreadsheet and
disconnecting the Google account are implemented. The next product
milestone is pagination for the public read. Do not add search,
filtering, sorting, or worksheet writes before pagination.

Because the OAuth scope is still `drive.file`, Google Picker is how a
user grants access to an existing spreadsheet. Do not broaden the
scope to full Drive access.

------------------------------------------------------------------------

# 8. Full Product Roadmap

## Phase 1 --- Foundation

### Milestone 1. Project setup

Tasks:

-   Create Next.js application
-   Configure TypeScript
-   Configure Tailwind
-   Configure App Router
-   Configure environment variables
-   Configure MySQL
-   Configure Prisma
-   Create database
-   Run initial migration

Acceptance criteria:

-   `npm run dev` works
-   Application loads
-   Prisma connects successfully
-   Database migration succeeds

------------------------------------------------------------------------

# 9. Phase 2 --- Application Authentication

## Milestone 2. User model

User fields:

``` text
id
name
email
password
createdAt
updatedAt
```

Rules:

-   Email unique
-   Email normalized
-   Password nullable if social login is added later

------------------------------------------------------------------------

## Milestone 3. Registration

Endpoint:

``` text
POST /api/auth/register
```

Request:

``` json
{
  "name": "John",
  "email": "john@example.com",
  "password": "password123"
}
```

Behavior:

-   Validate JSON
-   Validate name
-   Validate email
-   Validate password
-   Normalize email
-   Check duplicate
-   Hash password
-   Create user
-   Create authenticated session
-   Return safe user data

------------------------------------------------------------------------

## Milestone 4. Login

Endpoint:

``` text
POST /api/auth/login
```

Behavior:

-   Normalize email
-   Find user
-   Compare bcrypt hash
-   Create JWT
-   Store JWT in HTTP-only cookie
-   Return safe user information

------------------------------------------------------------------------

## Milestone 5. Session

Endpoint:

``` text
GET /api/auth/me
```

Returns:

``` json
{
  "id": 1,
  "name": "John",
  "email": "john@example.com"
}
```

Never return:

-   Password hash
-   JWT
-   Google access token
-   Google refresh token

------------------------------------------------------------------------

## Milestone 6. Logout

Endpoint:

``` text
POST /api/auth/logout
```

Behavior:

-   Clear auth cookie
-   Return success
-   Remain idempotent

------------------------------------------------------------------------

## Milestone 6a. Forgot password and password reset

Endpoints:

``` text
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

Pages:

``` text
/forgot-password
/reset-password
```

Behavior:

-   Validate the email address
-   Return the same success response whether or not the account exists
-   Generate a cryptographically random token with Node's `crypto` module
-   Store only the SHA-256 hash on `PasswordResetToken`
-   Expire each token after 1 hour
-   Accept each token only once
-   Invalidate older unused tokens when a new reset is requested
-   Email a reset URL that contains the raw token
-   Apply the same password rules and bcrypt cost used by registration
-   Mark the token used and set `User.passwordChangedAt`
-   Reject JWTs whose `iat` is earlier than `passwordChangedAt`
-   Clear the current browser's auth cookie
-   Do not return a JWT, password hash, or reset token

Development email:

If `SMTP_HOST` is unset and `NODE_ENV` is not `production`, the reset message is written to `tmp/dev-mail/`. Production requires SMTP and `APP_URL`, and it never logs the raw token.

------------------------------------------------------------------------

# 10. Phase 3 --- Authentication UI

## Milestone 7. Login page

Route:

``` text
/login
```

UI:

-   Email
-   Password
-   Login button
-   Error state
-   Register link

Successful login:

``` text
/login → /dashboard
```

------------------------------------------------------------------------

## Milestone 8. Register page

Route:

``` text
/register
```

UI:

-   Name
-   Email
-   Password
-   Create account
-   Login link

Successful registration:

``` text
/register → /dashboard
```

------------------------------------------------------------------------

## Milestone 8a. Forgot password page

Route:

``` text
/forgot-password
```

UI:

-   SheetAPI branding
-   Email
-   Send reset link
-   Loading state
-   Generic success message
-   Link back to `/login`

The page calls `POST /api/auth/forgot-password`.

------------------------------------------------------------------------

## Milestone 8b. Reset password page

Route:

``` text
/reset-password
```

UI:

-   Reads the token from the query string
-   New password and confirmation
-   The same password requirements as registration
-   Validation errors
-   Link back to `/login`

Successful reset:

``` text
/reset-password → /login?reset=success
```

`/login` includes a Forgot password link to `/forgot-password` and shows a success message after a reset.

------------------------------------------------------------------------

## Milestone 9. Protected dashboard

The dashboard should:

-   Detect authentication
-   Show logged-in user
-   Allow logout
-   Show Google connection status
-   Show API configurations later

------------------------------------------------------------------------

# 11. Phase 4 --- Google Sheets Connection

## Milestone 10. Google Cloud setup

Google Cloud configuration:

-   Create project
-   Enable Google Sheets API
-   Enable Google Drive API if required
-   Configure OAuth consent screen
-   Create OAuth Web Client

Local origin:

``` text
http://localhost:3000
```

Redirect:

``` text
http://localhost:3000/api/auth/google/callback
```

Production will later use:

``` text
https://YOUR_DOMAIN/api/auth/google/callback
```

Never expose:

-   Google Client Secret
-   Access tokens
-   Refresh tokens

------------------------------------------------------------------------

# 12. Phase 5 --- Google OAuth

## Milestone 11. Connect Google

Route:

``` text
GET /api/auth/google
```

Requirements:

-   Require application login
-   Generate cryptographically random state
-   Store state in HTTP-only cookie
-   Expire state after 10 minutes
-   Redirect to Google
-   Request only necessary scope

Initial scope:

``` text
https://www.googleapis.com/auth/drive.file
```

------------------------------------------------------------------------

## Milestone 12. OAuth callback

Route:

``` text
GET /api/auth/google/callback
```

Requirements:

-   Handle Google errors
-   Validate state
-   Validate authorization code
-   Exchange code for tokens
-   Retrieve Google Drive permission ID
-   Store/update GoogleConnection
-   Clear OAuth state cookie
-   Redirect to dashboard
-   Never expose tokens

------------------------------------------------------------------------

# 13. Phase 6 --- Spreadsheet Discovery

## Milestone 13. List spreadsheets

Create:

``` text
GET /api/google/sheets
```

Flow:

``` text
Application JWT
      ↓
Current user
      ↓
GoogleConnection
      ↓
Google access token
      ↓
Google Drive API
      ↓
Spreadsheet list
```

Return something like:

``` json
{
  "success": true,
  "spreadsheets": [
    {
      "id": "spreadsheet-id",
      "name": "Products"
    }
  ]
}
```

Only return files appropriate to the connected Google account and
configured scope.

Implemented. The handler refreshes an expired access token when a
refresh token is stored. `drive.file` still applies, so this list is
not the user's entire Drive.

Google Picker is implemented for choosing an existing spreadsheet
without widening the scope. The server validates the picked file and
stores its ID and metadata on `SelectedSpreadsheet`.

Worksheet selection is implemented.
`GET /api/google/sheets/:spreadsheetId` returns worksheet tabs for a
saved spreadsheet. `GET /api/google/sheets/:spreadsheetId/preview`
returns that worksheet's rows as strings for the dashboard preview.
Rows are not stored in MySQL.

------------------------------------------------------------------------

# 14. Phase 7 --- Spreadsheet Selection

## Milestone 14. Spreadsheet detail

Implemented:

``` text
GET /api/google/sheets/:spreadsheetId
```

Purpose:

-   Verify access
-   Retrieve spreadsheet metadata
-   Retrieve worksheet/tab information

Return:

``` json
{
  "id": "123",
  "name": "Products",
  "sheets": [
    {
      "id": 0,
      "title": "Sheet1"
    },
    {
      "id": 1,
      "title": "Customers"
    }
  ]
}
```

------------------------------------------------------------------------

# 15. Phase 8 --- Read Spreadsheet Data

## Milestone 15. Read worksheet

A dashboard preview reads a selected worksheet. Generated public APIs
are not part of this milestone.

``` text
GET /api/google/sheets/:spreadsheetId/preview?sheetId=
```

Server-side functionality reads:

``` text
spreadsheet
    ↓
worksheet
    ↓
header row
    ↓
data rows
    ↓
JSON objects
```

Example spreadsheet:

``` text
id | name | price
1  | Pen  | 20
2  | Book | 100
```

API representation:

``` json
[
  {
    "id": "1",
    "name": "Pen",
    "price": "20"
  },
  {
    "id": "2",
    "name": "Book",
    "price": "100"
  }
]
```

Initially treat spreadsheet values safely as strings unless explicit
type handling is later introduced.

------------------------------------------------------------------------

# 16. Phase 9 --- API Configuration

## Milestone 16. API model

Create an API configuration model.

Suggested fields:

``` text
id
userId
name
slug
spreadsheetId
worksheetId
worksheetName
status
createdAt
updatedAt
```

Possible status:

``` text
ACTIVE
DISABLED
```

An API configuration represents:

> This generated API is connected to this spreadsheet worksheet.

Implemented as the `Api` model. `slug` is unique across all users.
`status` is `ACTIVE` or `DISABLED`. Deleting a user deletes that
user's API configurations. Spreadsheet rows and Google tokens are not
columns on this model.

------------------------------------------------------------------------

# 17. Phase 10 --- API Creation

## Milestone 17. Create API

Dashboard flow:

``` text
Create API
    ↓
Choose spreadsheet
    ↓
Choose worksheet
    ↓
Enter API name
    ↓
Create
```

Backend validates:

-   User is authenticated
-   Google connection exists
-   Spreadsheet is accessible
-   Worksheet exists
-   API name is valid
-   Slug is unique

Then create API configuration.

Implemented. The dashboard form and `POST /api/apis` follow this
flow. See the API configuration section in Current Project State for
the request, response, and validation rules.

------------------------------------------------------------------------

# 18. Phase 11 --- API Keys

## Milestone 18. API key model

Suggested fields:

``` text
id
apiId
name
keyHash
keyPrefix
createdAt
lastUsedAt
expiresAt
revokedAt
```

Important security rule:

**Never store the raw API key.**

Generate:

``` text
raw key → hash → store hash
```

Show the raw key only once when created.

Implemented as `ApiKey`. `apiId` references `Api.id` and deletes with
that API. `keyHash` is unique. `keyPrefix`, `name`, `createdAt`,
`lastUsedAt`, and `revokedAt` are stored. `expiresAt` is not stored
yet.

------------------------------------------------------------------------

# 19. Phase 12 --- Generated REST API

## Milestone 19. Public GET endpoint

Concept:

``` text
/api/v1/{apiSlug}
```

Example:

``` text
GET /api/v1/products
```

The route returns the worksheet as JSON after the bearer key is
accepted. A request without a usable key does not read Google Sheets.

Request:

``` text
Authorization: Bearer YOUR_API_KEY
```

Implemented flow:

``` text
Request
  ↓
Find API by slug
  ↓
Validate API key
  ↓
Validate API status
  ↓
Find saved spreadsheet
  ↓
Record last-used time
  ↓
Find Google connection
  ↓
Refresh Google token if needed
  ↓
Read worksheet
  ↓
Convert rows to JSON
  ↓
Return response
```

------------------------------------------------------------------------

# 20. Phase 13 --- Query Features

## Milestone 20. Pagination

Support:

``` text
?page=1
&limit=20
```

Response:

``` json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

------------------------------------------------------------------------

## Milestone 21. Search

Example:

``` text
?q=pen
```

Search should operate across configured searchable fields.

------------------------------------------------------------------------

## Milestone 22. Filtering

Example:

``` text
?category=books
```

Or:

``` text
?price=100
```

Advanced operators can later include:

``` text
price_gt
price_lt
contains
starts_with
```

Do not make the first version unnecessarily complicated.

------------------------------------------------------------------------

## Milestone 23. Sorting

Example:

``` text
?sort=price
&order=desc
```

Validate the requested column against actual spreadsheet headers to
prevent unsafe query behavior.

------------------------------------------------------------------------

# 21. Phase 14 --- API Documentation

## Milestone 24. API documentation page

Every generated API should have a documentation page.

Show:

-   API endpoint
-   Authentication
-   Example request
-   Example response
-   Query parameters
-   Pagination
-   Search
-   Filtering
-   Sorting

Example:

``` bash
curl \
  -H "Authorization: Bearer YOUR_API_KEY" \
  https://yourdomain.com/api/v1/products
```

------------------------------------------------------------------------

# 22. Phase 15 --- Dashboard

## Milestone 25. Dashboard redesign

Implemented navigation:

``` text
Overview
My APIs
Google Sheets
API details
Settings
```

The overview shows connection status, API count, and shortcuts. API
keys stay on the individual API page. Requests this month, usage, and
recent request lists are not implemented.

------------------------------------------------------------------------

# 23. Phase 16 --- API Management

## Milestone 26. API list

User can:

-   View APIs
-   Open API
-   Disable API
-   Enable API
-   Rename API
-   Delete API

Delete, rename, enable, and disable are implemented. The list and the
details page ask for confirmation before delete and state that the
Google spreadsheet and worksheet are not deleted. Rename changes the
display name only. Enable and disable change `Api.status`.

------------------------------------------------------------------------

# 24. Phase 17 --- API Key Management

## Milestone 27. Key management

User can:

-   Create key
-   Name key
-   Revoke key
-   See prefix
-   See creation date
-   See last-used date
-   Set expiration later

Never show complete old keys again.

Create, name, revoke, prefix, creation date, and last-used date are
implemented on the dashboard. Expiration remains later.

------------------------------------------------------------------------

# 25. Phase 18 --- Google Token Management

## Milestone 28. Token refresh

When access token expires:

``` text
API request
   ↓
Access token expired
   ↓
Use refresh token
   ↓
Request new access token
   ↓
Update DB
   ↓
Continue request
```

If refresh fails:

-   Mark connection as requiring reconnection
-   Do not expose Google token details
-   Tell user to reconnect Google

Disconnecting the stored Google connection is implemented separately.
See Google connection management above. This refresh behavior is
unchanged.

------------------------------------------------------------------------

# 26. Phase 19 --- CRUD API

This comes after stable GET APIs.

## Milestone 29. POST

Example:

``` text
POST /api/v1/products
```

Body:

``` json
{
  "name": "Pencil",
  "price": "10"
}
```

Append row to spreadsheet.

------------------------------------------------------------------------

## Milestone 30. PATCH

Example:

``` text
PATCH /api/v1/products/2
```

Update matching spreadsheet row.

------------------------------------------------------------------------

## Milestone 31. DELETE

Example:

``` text
DELETE /api/v1/products/2
```

Delete or safely remove the corresponding row.

Important:

CRUD must be carefully designed around row identity.

Do not assume the first column is always an ID.

Later introduce explicit primary-key configuration.

------------------------------------------------------------------------

# 27. Phase 20 --- Spreadsheet Schema Configuration

## Milestone 32. Field configuration

Allow users to configure:

-   Primary key
-   Readable fields
-   Writable fields
-   Searchable fields
-   Hidden fields
-   Required fields
-   Field types

Example:

``` text
id       → primary key
name     → searchable
price    → number
email    → searchable
internal → hidden
```

------------------------------------------------------------------------

# 28. Phase 21 --- Caching

Directly reading Google Sheets for every request may become slow and
expensive.

Introduce optional caching.

Possible flow:

``` text
API request
    ↓
Cache?
 ┌──┴──┐
yes    no
 ↓      ↓
JSON   Google Sheets
 ↓      ↓
return update cache
```

Possible cache durations:

-   30 seconds
-   1 minute
-   5 minutes
-   15 minutes

User-configurable later.

------------------------------------------------------------------------

# 29. Phase 22 --- Rate Limiting

Protect public APIs.

Rate limits should operate per:

-   API key
-   API
-   User
-   IP where appropriate

Example:

``` text
100 requests/minute
```

When exceeded:

``` text
429 Too Many Requests
```

Do not depend only on application-level checks once deployed at scale;
use a suitable shared store such as Redis later.

------------------------------------------------------------------------

# 30. Phase 23 --- Usage Analytics

Create usage tracking.

Track:

``` text
apiId
apiKeyId
timestamp
method
statusCode
responseTime
requestCount
```

Do not store sensitive request bodies by default.

Dashboard:

``` text
Requests today
Requests this month
Errors
Average response time
Top endpoints
```

------------------------------------------------------------------------

# 31. Phase 24 --- Request Logs

Add an API request log page.

Filters:

-   Date
-   API
-   Status
-   Method
-   API key

Example:

``` text
GET /api/v1/products
200
124ms
```

Sensitive data should be redacted.

------------------------------------------------------------------------

# 32. Phase 25 --- Security Hardening

Before public launch:

## Authentication

-   Secure password hashing
-   Strong JWT secret
-   HTTP-only cookies
-   Secure cookies in production
-   SameSite protection
-   Session expiration
-   Login abuse protection
-   Hashed, expiring, single-use password reset tokens
-   No account enumeration on forgot password

## Google OAuth

-   State validation
-   Exact redirect URI
-   Minimal scopes
-   Token encryption at rest where appropriate
-   Never expose tokens
-   Safe refresh behavior

## API keys

-   Cryptographically random
-   Store hashes, not raw keys
-   Prefix for identification
-   Revoke support
-   Expiration support

## API

-   Rate limits
-   Input validation
-   Output limits
-   Pagination limits
-   Request size limits
-   Safe error messages
-   No internal stack traces
-   No secret leakage

## Database

-   Parameterized queries through Prisma
-   Least-privilege production DB account
-   Backups
-   Migration discipline

------------------------------------------------------------------------

# 33. Phase 26 --- Error Handling

Standard API error structure:

``` json
{
  "success": false,
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The API key is invalid or revoked."
  }
}
```

Possible codes:

``` text
UNAUTHORIZED
FORBIDDEN
INVALID_INPUT
NOT_FOUND
INVALID_API_KEY
API_DISABLED
GOOGLE_NOT_CONNECTED
GOOGLE_REAUTH_REQUIRED
SPREADSHEET_NOT_FOUND
WORKSHEET_NOT_FOUND
RATE_LIMITED
INTERNAL_ERROR
```

Never expose implementation details.

------------------------------------------------------------------------

# 34. Phase 27 --- Developer Experience

The product should feel extremely easy to use.

Ideal flow:

``` text
Create account
     ↓
Connect Google
     ↓
Choose spreadsheet
     ↓
Choose worksheet
     ↓
Create API
     ↓
Copy API key
     ↓
Copy endpoint
     ↓
Use API
```

Target:

**A new developer should be able to reach a working API in a few
minutes.**

------------------------------------------------------------------------

# 35. Phase 28 --- API Playground

Create a dashboard playground.

User can:

-   Select API
-   Select method
-   Enter query parameters
-   Send request
-   View response
-   View status code
-   View response time

This allows users to test their API before integrating it.

------------------------------------------------------------------------

# 36. Phase 29 --- Code Examples

Automatically generate examples for:

-   cURL
-   JavaScript
-   TypeScript
-   Python
-   PHP
-   Node.js
-   React

Example:

``` js
const response = await fetch(
  "https://yourdomain.com/api/v1/products",
  {
    headers: {
      Authorization: "Bearer YOUR_API_KEY"
    }
  }
);

const data = await response.json();
```

------------------------------------------------------------------------

# 37. Phase 30 --- OpenAPI

Later generate OpenAPI documentation.

Possible:

``` text
/api/v1/products/openapi.json
```

Then users can import the API into:

-   Postman
-   Insomnia
-   Swagger UI
-   Other developer tools

------------------------------------------------------------------------

# 38. Phase 31 --- Billing

After product-market validation.

Subscription architecture:

``` text
Free
Starter
Professional
Business
```

Possible limits:

-   Number of APIs
-   Number of requests
-   Number of Google connections
-   Cache duration
-   CRUD access
-   Analytics
-   Team members

Use a payment provider appropriate for the target market.

Do not build billing before the core product works reliably.

------------------------------------------------------------------------

# 39. Phase 32 --- Team Features

Future workspace model:

``` text
User
 ↓
Workspace
 ├── Members
 ├── APIs
 ├── Google connections
 ├── API keys
 └── Usage
```

Roles:

``` text
Owner
Admin
Developer
Viewer
```

------------------------------------------------------------------------

# 40. Phase 33 --- Additional Data Sources

After Google Sheets is stable:

``` text
Google Sheets
CSV
Excel
Airtable
Notion
Other spreadsheets
```

The internal abstraction should eventually become:

``` text
DataSource
   ↓
Schema
   ↓
Records
   ↓
REST API
```

This makes the product more than a Google Sheets wrapper.

------------------------------------------------------------------------

# 41. Phase 34 --- Import / Export

Allow:

-   CSV import
-   CSV export
-   Excel import
-   Excel export

Google Sheets remains the first-class source.

------------------------------------------------------------------------

# 42. Phase 35 --- Webhooks

Future features:

``` text
Record created
Record updated
Record deleted
```

Send:

``` text
POST https://customer-site.com/webhook
```

Useful for automation workflows.

------------------------------------------------------------------------

# 43. Phase 36 --- Production Infrastructure

Before production launch:

## Environment

Development:

``` text
localhost
```

Production:

``` text
https://yourdomain.com
```

## Production database

Use managed MySQL/MariaDB.

## Secrets

Store securely:

``` text
DATABASE_URL
JWT_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_PICKER_API_KEY
GOOGLE_APP_ID
APP_URL
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
EMAIL_FROM
```

Never commit `.env`.

------------------------------------------------------------------------

# 44. Phase 37 --- Domain and Deployment

Deploy Next.js to a production platform.

Configure:

-   Domain
-   HTTPS
-   Environment variables
-   Database
-   Google OAuth production redirect URI
-   CORS/security policies if needed
-   Logging
-   Monitoring

Production OAuth redirect:

``` text
https://YOUR_DOMAIN/api/auth/google/callback
```

Production Google OAuth settings must match the deployed domain exactly.

------------------------------------------------------------------------

# 45. Phase 38 --- Testing Strategy

Every milestone should have tests.

## Authentication tests

-   Register success
-   Duplicate email
-   Invalid email
-   Short password
-   Login success
-   Wrong password
-   Logout
-   Expired session
-   Protected endpoint without auth
-   Forgot password returns the same response for known and unknown emails
-   Reset token hash stored, raw token not stored
-   Reset token single-use
-   Expired reset token rejected
-   Newer reset request invalidates the previous token
-   Old password rejected after reset
-   Sessions issued before the reset rejected

## Google tests

-   Unauthenticated connect blocked
-   OAuth state created
-   OAuth state mismatch rejected
-   Google denial handled
-   Invalid code handled
-   Connection created
-   Reconnection updates same row
-   Refresh token preserved
-   Token never exposed
-   Picker session requires the SheetAPI session and a Google connection
-   Picker cancellation does not create a selection
-   A browser-supplied spreadsheet ID is rejected until Drive confirms it
-   Selected spreadsheet metadata is stored without spreadsheet rows
-   Worksheet list requires a saved spreadsheet and the SheetAPI session
-   Invalid spreadsheet IDs are rejected
-   Unknown worksheet IDs are rejected
-   Empty worksheets return no rows
-   Preview values are strings and are not written to MySQL

## Spreadsheet tests

-   No Google connection
-   Invalid spreadsheet
-   Valid spreadsheet
-   Multiple worksheets
-   Empty worksheet
-   Header-only worksheet
-   Duplicate headers
-   Large worksheet

## Generated API tests

-   Missing API key
-   Invalid API key
-   Revoked API key
-   Disabled API
-   Valid request
-   Pagination
-   Search
-   Filtering
-   Sorting
-   Google token expiry
-   Google reauthorization

## CRUD tests

-   Valid POST
-   Invalid POST
-   Valid PATCH
-   Missing record
-   Valid DELETE
-   Unauthorized mutation

------------------------------------------------------------------------

# 46. Phase 39 --- Performance

Initial target:

-   Fast dashboard
-   Minimal database queries
-   Avoid reading unnecessary spreadsheet ranges
-   Paginate API responses
-   Cache frequently requested sheets
-   Refresh Google tokens only when necessary

Later:

-   Redis
-   Background jobs
-   Queue processing
-   Distributed rate limiting
-   Dedicated API infrastructure

------------------------------------------------------------------------

# 47. Phase 40 --- Observability

Production should have:

-   Error tracking
-   Application logs
-   API request metrics
-   Database monitoring
-   Google API error monitoring
-   Uptime monitoring

Never log:

-   Passwords
-   JWTs
-   Password reset tokens
-   Google access tokens
-   Google refresh tokens
-   Full API keys

------------------------------------------------------------------------

# 48. Phase 41 --- Documentation

Create public documentation:

``` text
/docs
  getting-started
  authentication
  creating-an-api
  endpoints
  query-parameters
  pagination
  filtering
  sorting
  crud
  api-keys
  rate-limits
  errors
  examples
```

------------------------------------------------------------------------

# 49. Phase 42 --- Legal and Trust Pages

Before public launch:

-   Privacy Policy
-   Terms of Service
-   Cookie policy if required
-   Security information
-   Contact page

Explain clearly:

-   What Google permissions are requested
-   What data is stored
-   How Google tokens are protected
-   How users can disconnect Google. The in-app actions are implemented.
    This public explanation is not.
-   How API keys are handled
-   How usage data is handled

------------------------------------------------------------------------

# 50. Phase 43 --- Product Polish

Improve:

-   Empty states
-   Loading states
-   Error states
-   Toast notifications
-   Confirmation dialogs
-   Responsive design
-   Accessibility
-   Keyboard navigation
-   Mobile dashboard
-   Consistent typography
-   Consistent spacing
-   API documentation UX

The interface should remain simple rather than copying every feature of
a large SaaS dashboard.

------------------------------------------------------------------------

# 51. Phase 44 --- Launch Checklist

Before launch:

``` text
[ ] Authentication complete
[ ] Login UI complete
[ ] Register UI complete
[ ] Logout complete
[ ] Dashboard complete
[ ] Google OAuth tested
[x] Spreadsheet list working
[x] Worksheet selection working
[x] Spreadsheet reading working
[x] API creation working
[x] API key creation working
[x] GET API working with an API key
[ ] Search working
[ ] Filtering working
[ ] Pagination working
[ ] Documentation working
[x] API key revocation working
[ ] Google token refresh working
[ ] Rate limiting enabled
[ ] Error handling complete
[ ] Security audit completed
[ ] Production database configured
[ ] Environment variables configured
[ ] Google production OAuth configured
[ ] HTTPS configured
[ ] Monitoring configured
[ ] Privacy Policy published
[ ] Terms published
[ ] Backup strategy configured
```

------------------------------------------------------------------------

# 52. Recommended Build Order

Do not build everything simultaneously.

Follow this exact order:

``` text
1. Project foundation
2. Database
3. User registration backend
4. Login backend
5. Session backend
6. Logout backend
7. Login UI
8. Register UI
9. Dashboard authentication
10. Google OAuth
11. Google connection testing
12. Spreadsheet listing
13. Spreadsheet selection
14. Worksheet listing
15. Spreadsheet reading
16. API configuration
17. API creation
18. API keys
19. Generated GET API
20. Pagination
21. Search
22. Filtering
23. Sorting
24. API documentation
25. API management
26. Key management
27. Token refresh
28. API playground
29. Usage analytics
30. Request logs
31. Caching
32. Rate limiting
33. CRUD
34. Schema configuration
35. Security hardening
36. Production deployment
37. Billing
38. Teams
39. Additional data sources
40. Advanced features
```

------------------------------------------------------------------------

# 53. Current Database Direction

Current schema contains:

``` text
User
PasswordResetToken
GoogleConnection
SelectedSpreadsheet
Api
ApiKey
```

`ApiKey` stores a hash, display prefix, name, and revocation state.
Do not add `ApiField`, `ApiUsage`, or `RequestLog` until those
features are built.

Recommended future schema:

``` text
User
 ├── PasswordResetToken
 ├── GoogleConnection
 ├── SelectedSpreadsheet
 ├── Api
 │    ├── ApiKey
 │    ├── ApiField
 │    └── ApiUsage
 ├── RequestLog
 └── WorkspaceMembership (future)
```

Do not create dozens of unused tables at the beginning.

------------------------------------------------------------------------

# 54. API Architecture

There are two categories of APIs.

## Internal application APIs

Used by the dashboard:

``` text
/api/auth/*
/api/google/*
/api/apis/*
/api/keys/*
```

These use the application's JWT session.

## Public generated APIs

Used by customers' applications:

``` text
/api/v1/{apiSlug}
```

These use generated API keys.

This distinction must remain clear throughout development.

------------------------------------------------------------------------

# 55. Authentication Architecture

## Application login

``` text
Email + password
       ↓
POST /api/auth/login
       ↓
JWT
       ↓
HTTP-only cookie
       ↓
Dashboard
```

## Password reset

``` text
Email
  ↓
POST /api/auth/forgot-password
  ↓
SHA-256 token hash stored
  ↓
Reset URL emailed
  ↓
POST /api/auth/reset-password
  ↓
bcrypt password update
  ↓
Token marked used
  ↓
Earlier JWTs rejected
  ↓
/login
```

## Google connection

``` text
Logged-in user
       ↓
Connect Google Sheets
       ↓
Google OAuth
       ↓
Google access/refresh tokens
       ↓
GoogleConnection
```

## Public API

``` text
Developer's request
       ↓
Bearer API key
       ↓
API key validation
       ↓
Google Sheet
       ↓
JSON response
```

`GET /api/v1/{slug}` now follows this flow. The bearer key is hashed
and compared with the stored hash before any worksheet read.

These three systems must not be mixed together.

------------------------------------------------------------------------

# 56. Security Rules

These rules are permanent product requirements.

### Never expose secrets

Never return or log:

-   Google client secret
-   Google refresh token
-   Google access token, except the current access token sent only to
    the signed-in browser when opening Google Picker
-   JWT secret
-   Password hashes
-   Raw password reset tokens
-   Raw API keys after initial creation

### Never trust client input

Validate:

-   IDs
-   slugs
-   spreadsheet IDs
-   worksheet IDs
-   query parameters
-   pagination
-   sorting fields
-   filters
-   request bodies

### Never let one user access another user's resources

Every protected resource must be scoped through the authenticated user.

Example:

``` text
API ID
 ↓
API owner
 ↓
Current user
```

Never accept ownership from the browser.

------------------------------------------------------------------------

# 57. UX Goal

The product should feel like this:

### Step 1

"Create an account."

### Step 2

"Connect Google."

### Step 3

"Choose your spreadsheet."

### Step 4

"Choose your worksheet."

### Step 5

"Create API."

### Step 6

"Copy endpoint and API key."

### Step 7

"Call the API."

The user should not need to understand:

-   OAuth internals
-   Google Drive permissions
-   database design
-   server configuration
-   backend programming

------------------------------------------------------------------------

# 58. Product Differentiation Opportunities

The first version should compete primarily on simplicity.

Possible differentiation later:

-   Better developer experience
-   Faster setup
-   Better API documentation
-   API playground
-   Automatic schema detection
-   Automatic field/type detection
-   Better filtering
-   Better caching
-   Easy CRUD
-   Webhooks
-   Generated SDKs
-   OpenAPI
-   Multiple spreadsheet sources

Do not try to build every differentiator before the core API works.

------------------------------------------------------------------------

# 59. Definition of MVP Complete

The MVP is considered complete when a brand-new user can:

``` text
Register
   ↓
Login
   ↓
Connect Google
   ↓
Select spreadsheet
   ↓
Select worksheet
   ↓
Create API
   ↓
Generate API key
   ↓
Call:
GET /api/v1/example
   ↓
Receive spreadsheet data as JSON
```

And the system correctly handles:

-   Invalid authentication
-   Invalid API keys
-   Google token expiration
-   Missing spreadsheet
-   Missing worksheet
-   Disabled API
-   Pagination
-   Search
-   Filtering
-   Basic rate limiting
-   Safe errors

------------------------------------------------------------------------

# 60. Final Product Vision

The long-term product is not merely a "Google Sheets viewer."

It is a lightweight **data-to-API platform**.

The long-term architecture should allow:

``` text
                 ┌──────────────┐
                 │ Google Sheet │
                 └──────┬───────┘
                        │
                 ┌──────▼───────┐
                 │              │
CSV ────────────►│ Data Source  │◄──────── Excel
                 │ Abstraction  │
                 └──────┬───────┘
                        │
                 ┌──────▼───────┐
                 │ Schema Layer │
                 └──────┬───────┘
                        │
                 ┌──────▼───────┐
                 │ API Generator│
                 └──────┬───────┘
                        │
              ┌─────────▼──────────┐
              │ Generated REST API │
              └─────────┬──────────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
     Website           App          Automation
```

The immediate goal is much smaller:

> **Get Google Sheet data reliably exposed as a secure REST API.**

Everything else should be built around making that core experience
reliable, simple, and valuable.

------------------------------------------------------------------------

# 61. Development Rule for This Project

For each milestone:

1.  Give Cursor one coherent implementation prompt.
2.  Let Cursor inspect the existing code before modifying it.
3.  Keep unrelated functionality untouched.
4.  Run TypeScript checks.
5.  Run lint.
6.  Test the actual endpoint or UI.
7.  Verify the database when relevant.
8.  Explain what changed.
9.  Mark the milestone complete.
10. Move to the next milestone.

Do not jump ahead until the current milestone works.

------------------------------------------------------------------------

# 62. Current Next Step

The project is currently between:

``` text
API keys
        ↓
Pagination
```

Password reset, Google account connection, spreadsheet listing,
worksheet preview, API configuration, API keys, and a keyed public GET
are implemented.

``` text
POST /api/apis
GET  /api/apis
PATCH /api/apis/{apiId}
DELETE /api/apis/{apiId}
GET  /api/apis/{apiId}/keys
POST /api/apis/{apiId}/keys
POST /api/apis/{apiId}/keys/{keyId}/revoke
GET  /api/v1/{slug}
```

`GET /api/v1/{slug}` reads the configuration owner's Google Sheet only
after a valid bearer key for that API is presented. Slugs are globally
unique. Disabled configurations and missing selections do not return
rows. A deleted configuration returns 404. The OAuth scope remains
`https://www.googleapis.com/auth/drive.file`.

Dashboard navigation is implemented at `/dashboard`, `/dashboard/apis`,
`/dashboard/apis/new`, `/dashboard/apis/{apiId}`, `/dashboard/sheets`,
and `/dashboard/settings`. Rename, enable, disable, and delete are
available from My APIs and from the API details page.

The next milestone is pagination:

``` text
?page=1
&limit=20
```

Do not add search, filtering, or write methods in that milestone.
