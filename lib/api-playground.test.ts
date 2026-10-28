import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, describe, it } from "node:test";
import bcrypt from "bcrypt";
import { prisma } from "./prisma";
import {
  buildPlaygroundRequest,
  formatPlaygroundBody,
  isPlaygroundMethodSupported,
  parsePlaygroundSelector,
  PLAYGROUND_DEFAULT_BODY,
  PLAYGROUND_DEFAULT_METHOD,
  PLAYGROUND_DELETE_CONFIRM_MESSAGE,
  PLAYGROUND_DESCRIPTION,
  PLAYGROUND_METHODS,
  PLAYGROUND_MISSING_KEY_MESSAGE,
  PLAYGROUND_SELECTOR_HELP,
  PLAYGROUND_SUPPORTED_METHODS,
  playgroundAuthorization,
  playgroundMethodUsesBody,
  readPlaygroundError,
  readPlaygroundMethod,
  redactPlaygroundSecret,
} from "./api-playground";
import { readPublicFilters } from "./public-api-filter";

const endpoint = "http://localhost:3000/api/v1/products";

function builtRequest(
  input: Parameters<typeof buildPlaygroundRequest>[0],
) {
  const built = buildPlaygroundRequest(input);
  assert.equal(built.ok, true);

  if (!built.ok) {
    throw new Error("playground request was not accepted");
  }

  return built.request;
}

describe("API playground selector parser", () => {
  it("parses empty, column/value filters, and row/N selectors", () => {
    assert.deepEqual(parsePlaygroundSelector(""), {
      ok: true,
      selector: { kind: "empty" },
    });
    assert.deepEqual(parsePlaygroundSelector("  "), {
      ok: true,
      selector: { kind: "empty" },
    });
    assert.deepEqual(parsePlaygroundSelector("city/london"), {
      ok: true,
      selector: { kind: "filter", column: "city", value: "london" },
    });
    assert.deepEqual(parsePlaygroundSelector("city name/london & paris"), {
      ok: true,
      selector: {
        kind: "filter",
        column: "city name",
        value: "london & paris",
      },
    });
    assert.deepEqual(parsePlaygroundSelector("row/3"), {
      ok: true,
      selector: { kind: "row", rowNumber: 3 },
    });
    assert.deepEqual(parsePlaygroundSelector("ROW/2"), {
      ok: true,
      selector: { kind: "row", rowNumber: 2 },
    });

    const header = parsePlaygroundSelector("row/1");
    assert.equal(header.ok, false);

    if (!header.ok) {
      assert.equal(
        header.message,
        "rowNumber 1 is the header row and cannot be changed.",
      );
    }

    const bare = parsePlaygroundSelector("london");
    assert.equal(bare.ok, false);

    if (!bare.ok) {
      assert.match(bare.message, /column\/value/);
    }

    const reserved = parsePlaygroundSelector("limit/2");
    assert.equal(reserved.ok, false);

    if (!reserved.ok) {
      assert.match(reserved.message, /limit and offset/);
    }

    assert.equal(PLAYGROUND_SELECTOR_HELP.includes("column/value"), true);
    assert.equal(PLAYGROUND_SELECTOR_HELP.includes("row/N"), true);
  });
});

describe("API playground request builder", () => {
  it("builds GET requests from an empty selector or column/value filter", () => {
    const all = builtRequest({
      endpoint,
      method: "GET",
      selector: "",
      body: "",
      deleteConfirmed: false,
    });
    assert.equal(all.url, endpoint);
    assert.equal(all.method, "GET");

    const filtered = builtRequest({
      endpoint,
      method: "GET",
      selector: "city name/london & paris",
      body: "",
      deleteConfirmed: false,
    });
    const params = new URL(filtered.url).searchParams;
    const filters = readPublicFilters(params);

    assert.equal(filtered.url.includes("api_key"), false);
    assert.equal(filtered.url.includes("Authorization"), false);
    assert.equal(params.get("city name"), "london & paris");
    assert.equal(filters.ok, true);

    if (!filters.ok) {
      return;
    }

    assert.deepEqual(filters.filters, [
      { column: "city name", value: "london & paris" },
    ]);

    const rowOnGet = buildPlaygroundRequest({
      endpoint,
      method: "GET",
      selector: "row/3",
      body: "",
      deleteConfirmed: false,
    });
    assert.equal(rowOnGet.ok, false);
  });

  it("builds POST, PUT, PATCH, and DELETE from the simplified selector", () => {
    assert.equal(PLAYGROUND_DEFAULT_METHOD, "GET");
    assert.deepEqual(PLAYGROUND_METHODS, [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ]);
    assert.deepEqual(PLAYGROUND_SUPPORTED_METHODS, PLAYGROUND_METHODS);
    assert.equal(isPlaygroundMethodSupported("DELETE"), true);
    assert.equal(playgroundMethodUsesBody("POST"), true);
    assert.equal(readPlaygroundMethod("post"), null);

    const post = builtRequest({
      endpoint,
      method: "POST",
      selector: "",
      body: PLAYGROUND_DEFAULT_BODY,
      deleteConfirmed: false,
    });
    assert.equal(post.method, "POST");
    assert.equal(post.url, endpoint);
    assert.equal(post.headers["Content-Type"], "application/json");

    const postWithFilter = buildPlaygroundRequest({
      endpoint,
      method: "POST",
      selector: "city/london",
      body: PLAYGROUND_DEFAULT_BODY,
      deleteConfirmed: false,
    });
    assert.equal(postWithFilter.ok, false);

    const put = builtRequest({
      endpoint,
      method: "PUT",
      selector: "row/3",
      body: '{"id":"2","city":"rome"}',
      deleteConfirmed: false,
    });
    assert.equal(put.method, "PUT");
    assert.equal(put.url, `${endpoint}?rowNumber=3`);

    const patch = builtRequest({
      endpoint,
      method: "PATCH",
      selector: "row/2",
      body: '{"city":"paris"}',
      deleteConfirmed: false,
    });
    assert.equal(patch.url, `${endpoint}?rowNumber=2`);

    const deleted = builtRequest({
      endpoint,
      method: "DELETE",
      selector: "row/4",
      body: "",
      deleteConfirmed: true,
    });
    assert.equal(deleted.method, "DELETE");
    assert.equal(deleted.url, `${endpoint}?rowNumber=4`);

    const needsConfirm = buildPlaygroundRequest({
      endpoint,
      method: "DELETE",
      selector: "row/4",
      body: "",
      deleteConfirmed: false,
    });
    assert.equal(needsConfirm.ok, false);

    if (!needsConfirm.ok) {
      assert.equal(
        needsConfirm.message,
        "Confirm deletion before sending a DELETE request.",
      );
    }

    const filterOnPut = buildPlaygroundRequest({
      endpoint,
      method: "PUT",
      selector: "city/london",
      body: '{"id":"1"}',
      deleteConfirmed: false,
    });
    assert.equal(filterOnPut.ok, false);

    const missingRow = buildPlaygroundRequest({
      endpoint,
      method: "PATCH",
      selector: "",
      body: '{"city":"paris"}',
      deleteConfirmed: false,
    });
    assert.equal(missingRow.ok, false);

    assert.equal(PLAYGROUND_DELETE_CONFIRM_MESSAGE.includes("deletes"), true);
    assert.equal(PLAYGROUND_DESCRIPTION.includes("Run"), true);
  });

  it("rejects invalid endpoints and keeps secrets out of the URL", () => {
    const missing = playgroundAuthorization(null);
    assert.equal(missing.ok, false);

    if (!missing.ok) {
      assert.equal(missing.message, PLAYGROUND_MISSING_KEY_MESSAGE);
    }

    const secret = "sk_live_example_secret";
    const authorized = playgroundAuthorization(secret);
    assert.equal(authorized.ok, true);

    if (!authorized.ok) {
      return;
    }

    assert.equal(authorized.authorization, `Bearer ${secret}`);

    const request = builtRequest({
      endpoint,
      method: "GET",
      selector: `city/${secret}`,
      body: "",
      deleteConfirmed: false,
    });
    assert.equal(request.url.includes("Bearer"), false);
    assert.equal(request.url.includes("api_key"), false);
    assert.equal(new URL(request.url).searchParams.get("city"), secret);
    assert.equal(
      redactPlaygroundSecret(`token ${secret} again ${secret}`, secret),
      "token [redacted] again [redacted]",
    );

    const withQuery = buildPlaygroundRequest({
      endpoint: `${endpoint}?api_key=secret`,
      method: "GET",
      selector: "",
      body: "",
      deleteConfirmed: false,
    });
    assert.equal(withQuery.ok, false);
  });

  it("reads the public error message and formats JSON", () => {
    assert.equal(
      readPlaygroundError(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "town is not a column in this worksheet.",
          },
        },
        false,
      ),
      "town is not a column in this worksheet.",
    );
    assert.equal(readPlaygroundError([{ id: "1" }], true), null);
    assert.equal(readPlaygroundError("nope", false), "The request failed.");
    assert.equal(
      formatPlaygroundBody([{ city: "london" }]),
      '[\n  {\n    "city": "london"\n  }\n]',
    );
  });
});

const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Play-${stamp}-pass`;
const ownerEmail = `playground-${stamp}-owner@example.com`;
const otherEmail = `playground-${stamp}-other@example.com`;
const baseUrl = "http://127.0.0.1:3000";

async function login(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .find((value) => value?.startsWith("auth_token="));
  assert.ok(cookie);
  return cookie;
}

describe("API playground page ownership", { concurrency: 1 }, () => {
  it("shows the simplified playground only on an API the signed-in user owns", async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const owner = await prisma.user.create({
      data: {
        name: "Playground owner",
        email: ownerEmail,
        password: passwordHash,
      },
    });
    const other = await prisma.user.create({
      data: {
        name: "Playground other",
        email: otherEmail,
        password: passwordHash,
      },
    });
    assert.notEqual(other.id, owner.id);
    const slug = `play${stamp.replace(/[^a-z0-9]/g, "")}`;
    const api = await prisma.api.create({
      data: {
        userId: owner.id,
        name: "Playground API",
        slug,
        spreadsheetId: `sheet-play-${stamp}`,
        worksheetId: 0,
        worksheetName: "Sheet1",
      },
    });
    const path = `/dashboard/apis/${api.id}`;
    const signedOut = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
    const signedOutHtml = await signedOut.text();
    assert.equal(
      signedOut.status === 307 || signedOutHtml.includes("/login"),
      true,
    );
    assert.equal(signedOutHtml.includes("Run"), false);

    const otherCookie = await login(otherEmail);
    const foreign = await fetch(`${baseUrl}${path}`, {
      headers: { cookie: otherCookie },
      redirect: "manual",
    });
    const foreignHtml = await foreign.text();
    assert.equal(foreignHtml.includes("Page not found"), true);
    assert.equal(foreignHtml.includes("API Playground"), false);

    const ownerCookie = await login(ownerEmail);
    const owned = await fetch(`${baseUrl}${path}`, {
      headers: { cookie: ownerCookie },
      redirect: "manual",
    });
    const ownedHtml = await owned.text();
    assert.equal(owned.status, 200);
    assert.equal(ownedHtml.includes("API Playground"), true);
    assert.equal(ownedHtml.includes("Run"), true);
    assert.equal(ownedHtml.includes(PLAYGROUND_DESCRIPTION), true);
    assert.equal(ownedHtml.includes("Row ID or Filter (Optional)"), true);
    assert.equal(ownedHtml.includes(`/api/v1/${slug}`), true);
    assert.equal(ownedHtml.includes("Add filter"), false);
    assert.equal(ownedHtml.includes("playground-limit"), false);
    const methodOrder = ["GET", "POST", "PUT", "PATCH", "DELETE"].map(
      (method) => ownedHtml.indexOf(`value="${method}"`),
    );
    assert.equal(
      methodOrder.every((index) => index >= 0),
      true,
    );
    assert.deepEqual(
      methodOrder,
      [...methodOrder].sort((left, right) => left - right),
    );
    assert.equal(ownedHtml.includes("sk_live_"), false);
    assert.equal(ownedHtml.includes("localStorage"), false);
    assert.equal(ownedHtml.includes("sessionStorage"), false);
  });
});

after(async () => {
  await prisma.user.deleteMany({
    where: { email: { in: [ownerEmail, otherEmail] } },
  });
  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});
