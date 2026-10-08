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

A basic dashboard exists.

It currently shows:

-   Connect Google Sheets
-   Connected state
-   Reconnect option

The dashboard is intentionally minimal at this stage.

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
Drive API returns only spreadsheets this app can already access. An
empty list means an explicit file-selection step, such as Google
Picker, is required before existing spreadsheets can be chosen. The
scope was not broadened. Google Picker is not implemented yet.

------------------------------------------------------------------------

# 7. Current Immediate Work

Application authentication, including password reset, is implemented:

``` text
/login
/register
/forgot-password
/reset-password
/dashboard
```

Spreadsheet listing is implemented:

``` text
GET /api/google/sheets
```

The next product milestone is worksheet selection:

``` text
GET /api/google/sheets/:spreadsheetId
```

Because the OAuth scope is still `drive.file`, Google Picker or
another explicit file-selection step may be required before a user
can choose an existing spreadsheet. Do not broaden the scope to full
Drive access.

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
not the user's entire Drive. Worksheet selection is the next
milestone. Google Picker is the likely way to grant access to an
existing spreadsheet without widening the scope.

------------------------------------------------------------------------

# 14. Phase 7 --- Spreadsheet Selection

## Milestone 14. Spreadsheet detail

Create endpoint:

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

Create server-side functionality to read:

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

Request:

``` text
Authorization: Bearer YOUR_API_KEY
```

Flow:

``` text
Request
  ↓
Find API by slug
  ↓
Validate API status
  ↓
Validate API key
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

Dashboard sections:

``` text
Overview
My APIs
Google Connections
API Keys
Usage
Settings
```

Dashboard should show:

-   Number of APIs
-   Requests this month
-   Active connections
-   Recent APIs
-   Recent requests later

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

Deletion should require confirmation.

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
-   How users can disconnect Google
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
[ ] Spreadsheet list working
[ ] Worksheet selection working
[ ] Spreadsheet reading working
[ ] API creation working
[ ] API key creation working
[ ] GET API working
[ ] Search working
[ ] Filtering working
[ ] Pagination working
[ ] Documentation working
[ ] API key revocation working
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
```

The next major database models should be introduced only when their
corresponding features are built.

Recommended future schema:

``` text
User
 ├── PasswordResetToken
 ├── GoogleConnection
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

These three systems must not be mixed together.

------------------------------------------------------------------------

# 56. Security Rules

These rules are permanent product requirements.

### Never expose secrets

Never return or log:

-   Google client secret
-   Google access token
-   Google refresh token
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
Google connection
        ↓
Spreadsheet discovery
        ↓
Worksheet selection
```

Password reset, Google account connection, and spreadsheet listing are
implemented.

`GET /api/google/sheets` is live. The dashboard can retrieve and
display spreadsheets for a connected Google account. The OAuth scope
remains `https://www.googleapis.com/auth/drive.file`.

The immediate task is worksheet selection:

``` text
GET /api/google/sheets/:spreadsheetId
```

`drive.file` does not automatically expose existing spreadsheets. If
the list is empty, Google Picker (or another explicit file-selection
step) is required before worksheet selection can target a spreadsheet
the user already owns. Do not replace `drive.file` with full Drive
access.

Once a spreadsheet can be selected, the project moves into the actual
core SheetAPI functionality:

``` text
Google Spreadsheet
        ↓
Worksheet
        ↓
Rows → JSON
        ↓
Generated API
        ↓
API key
        ↓
Developer request
```

That is the central milestone of the entire product.
