This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Install and deployment

Prisma ORM 7.10 reads `prisma7.config.ts`. The datasource URL is `DATABASE_URL` from the environment. The schema provider is MySQL. Generated Prisma Client is written to `app/generated/prisma` and is not committed.

A `DATABASE_URL` that passes the production startup check is only a parsed `mysql://` or `mariadb://` URL. It does not mean the database can be reached or that the tables exist.

### Local development

```bash
npm ci
npm run dev
```

`npm ci` installs the lockfile and generates Prisma Client. `npm run dev` does not apply migrations.

Create or apply local migrations only against a disposable local database:

```bash
npx prisma migrate dev --config prisma7.config.ts
```

Do not point that command at a production database.

### Production

Use Node.js `^20.19`, `^22.12`, or `24` or newer. Create an empty MySQL or MariaDB database first. `prisma migrate deploy` creates tables in that database. It does not create the database itself.

Set `DATABASE_URL` and the other production variables listed below. Then, from a clean checkout:

```bash
npm ci
npm run db:migrate:deploy
npm run build
npm start
```

- `npm ci` installs exact lockfile versions and runs `prisma generate --config prisma7.config.ts`.
- `npm run db:generate` runs that generate command again.
- `npm run build` generates the client again, then runs `next build`.
- `npm run db:migrate:deploy` runs `prisma migrate deploy --config prisma7.config.ts`. It applies the migrations already in `prisma/migrations` and does not create a new migration.
- `npm start` serves the built app. Apply migrations before starting it.

Do not run `prisma migrate dev`, `prisma migrate reset`, or `prisma db push` against production.

## Tests

`npm test` runs the isolated Node.js test files. Those tests do not use the database or Google.

`npm run test:all` runs every `lib/*.test.ts` file. That suite may read and write database rows and call a live Google account or local server. Run it only in an isolated test environment, never against production data.

## Public worksheet limits

A public worksheet has one header row and at most 10,000 data rows, 200 columns, and 50,000 characters in a cell. Data rows are sheet rows 2 through 10001. Reads request `A1:GS10002`. Column GS and row 10002 are probes: if Google returns either, the response is HTTP 413 `WORKSHEET_TOO_LARGE` and no rows are returned. The same error is returned for a cell longer than 50,000 characters.

POST checks that limit before it appends. A sheet that already has 10,000 data rows is not written. A successful POST reports the row number from Google's `updatedRange`, not from the earlier row count. PUT, PATCH, and DELETE also refuse a cell, column, or row outside those limits before they change the sheet. An existing row inside the limit can still be replaced, patched, or deleted.

Google omits empty trailing rows and columns. A blank row between data rows still counts. Content that begins only after an empty probe, past row 10002 or column GS, is outside the read. Two appends at the same moment can still both pass the pre-check; if Google then places a row on the probe, that response is 413 even though the row was already appended.

## Rate limiting

Sign-in, registration, and password reset are limited per client IP. A public API call that sends a bearer key is limited by a hash of that key. The thresholds are unchanged.

This app is not behind a chosen hosting proxy, and a route `Request` does not include the TCP address of the caller. `X-Forwarded-For` and `X-Real-IP` are ignored until `RATE_LIMIT_TRUSTED_PROXY_HOPS` is set, so every caller without an API key shares one bucket named `unknown`.

Before production, terminate client connections at a reverse proxy you control. That proxy must append the address it actually accepted, or replace the header with that address. Then set `RATE_LIMIT_TRUSTED_PROXY_HOPS` to the number of those proxies, from 1 to 5. One proxy is `1`. The limiter reads that many entries from the right of `X-Forwarded-For`, never the first address. Leave the variable unset when clients can connect straight to the Node process. Setting it higher than the real proxy chain lets a caller pick a new identity again.

## Production startup checks

`instrumentation.ts` runs `assertProductionConfig` in the Node.js server runtime, before that server accepts requests. The check is skipped outside production, during `next build`, and in the Edge bundle. This app serves its routes from the Node.js runtime. Local development keeps its current defaults.

Production startup requires these settings. Errors name the variable and do not print the value:

- `JWT_SECRET`: at least 32 characters, with enough distinct characters
- `TOKEN_ENCRYPTION_KEY`: 64 hex characters, or 32 bytes of base64 or base64url
- `APP_URL`: `https` origin, with no user, password, path, query, or hash
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`: `https://<APP_URL host>/api/auth/google/callback`
- `GOOGLE_PICKER_API_KEY`, plus `GOOGLE_APP_ID` when the client id does not start with the Cloud project number
- `DATABASE_URL`: a `mysql://` or `mariadb://` URL with user, password, host, and database name. Startup does not open a connection.
- `SMTP_HOST`, `SMTP_PORT`, and `EMAIL_FROM`. Set `SMTP_USER` and `SMTP_PASSWORD` together, or omit both.
- `ALLOW_INSECURE_COOKIES` and `RATE_LIMIT_DISABLED` must not be turned on

`RATE_LIMIT_TRUSTED_PROXY_HOPS` is not required yet. Leave it unset until the hosting proxy is chosen. A value other than `0` through `5` stops startup. Unset means every caller without an API key shares the `unknown` bucket.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
