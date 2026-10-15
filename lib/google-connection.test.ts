import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, afterEach, describe, it } from "node:test";
import bcrypt from "bcrypt";
import { GET } from "../app/api/v1/[slug]/route";
import { apiReadAvailability } from "./api-availability";
import { createOwnedApiKey } from "./api-key-store";
import {
  disconnectOwnedGoogleAccount,
  disconnectOwnedSpreadsheet,
} from "./google-connection";
import { revokeGoogleToken } from "./google";
import {
  GOOGLE_DISCONNECT_UNCONFIRMED_MESSAGE,
  GOOGLE_RECONNECT_REQUIRED_MESSAGE,
  SPREADSHEET_SELECTION_DISCONNECTED_MESSAGE,
} from "./google-disconnect-copy";
import { prisma } from "./prisma";

const originalFetch = globalThis.fetch;
const originalError = console.error;
const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Disconnect-${stamp}-pass`;
const baseUrl = process.env.SHEETAPI_TEST_BASE_URL ?? "http://127.0.0.1:3000";
const createdEmails: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalError;
});

after(async () => {
  await prisma.user.deleteMany({
    where: { email: { in: createdEmails } },
  });
  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});

type RecordedRequest = {
  url: string;
  method: string;
  body: string;
};

function requestBody(body: RequestInit["body"]) {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  return "";
}

function installGoogle(options: {
  valuesBySheet?: Record<string, string[][]>;
  revokeStatus?: number;
  revokeNetworkError?: boolean;
  revokeBody?: string;
}) {
  const requests: RecordedRequest[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = requestBody(init?.body);
    requests.push({ url, method, body });

    if (url.includes("oauth2.googleapis.com/revoke")) {
      if (options.revokeNetworkError) {
        throw new Error("network down");
      }

      return new Response(options.revokeBody ?? "", {
        status: options.revokeStatus ?? 200,
      });
    }

    if (url.includes("googleapis.com/drive/")) {
      throw new Error("Drive must not be called while disconnecting");
    }

    const spreadsheetId = spreadsheetIdFromUrl(url);

    if (url.includes("/values/")) {
      return Response.json({
        values: options.valuesBySheet?.[spreadsheetId] ?? [["id"], ["row"]],
      });
    }

    return Response.json({
      spreadsheetId,
      properties: { title: "Products" },
      sheets: [
        {
          properties: { sheetId: 0, title: "Sheet1", index: 0 },
        },
      ],
    });
  };

  return requests;
}

function spreadsheetIdFromUrl(url: string) {
  const match = url.match(/\/spreadsheets\/([^/?]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

async function callPublic(slug: string, authorization: string) {
  const response = await GET(
    new Request(`http://localhost/api/v1/${slug}`, {
      headers: { authorization },
    }),
    { params: Promise.resolve({ slug }) },
  );
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  return { status: response.status, body, text };
}

function errorCode(body: unknown) {
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  assert.equal(Array.isArray(body), false);
  const record = body as {
    success?: unknown;
    error?: { code?: unknown; message?: unknown };
  };
  assert.equal(record.success, false);
  return { code: record.error?.code, message: record.error?.message };
}

async function createUser(label: string) {
  const email = `disconnect-${stamp}-${label}@example.com`;
  createdEmails.push(email);
  const user = await prisma.user.create({
    data: {
      name: `Disconnect ${label}`,
      email,
      password: await bcrypt.hash(password, 4),
    },
  });

  return { user, email };
}

async function createApi(userId: number, spreadsheetId: string, label: string) {
  const api = await prisma.api.create({
    data: {
      userId,
      name: `${label} API`,
      slug: `disc${stamp.replace(/[^a-z0-9]/g, "")}${label}`,
      spreadsheetId,
      worksheetId: 0,
      worksheetName: "Sheet1",
    },
  });
  const created = await createOwnedApiKey(userId, api.id, `${label} key`);
  assert.equal(created.ok, true);

  if (!created.ok) {
    throw new Error("API key was not created");
  }

  return { api, secret: created.secret, keyId: created.key.id };
}

function futureExpiry() {
  return new Date(Date.now() + 60 * 60 * 1000);
}

describe("Google connection management", { concurrency: 1 }, () => {
  it("describes when a saved API can no longer read a spreadsheet", () => {
    assert.equal(
      apiReadAvailability({
        status: "ACTIVE",
        spreadsheetSaved: true,
        googleConnected: true,
      }),
      "active",
    );
    assert.equal(
      apiReadAvailability({
        status: "DISABLED",
        spreadsheetSaved: false,
        googleConnected: false,
      }),
      "disabled",
    );
    assert.equal(
      apiReadAvailability({
        status: "ACTIVE",
        spreadsheetSaved: false,
        googleConnected: true,
      }),
      "spreadsheet_disconnected",
    );
    assert.equal(
      apiReadAvailability({
        status: "ACTIVE",
        spreadsheetSaved: true,
        googleConnected: false,
      }),
      "google_disconnected",
    );
  });

  it("disconnects one spreadsheet and restores that API when it is saved again", async () => {
    const owner = await createUser("sheet-owner");
    const other = await createUser("sheet-other");
    const ownerSheet = `owner-sheet-${stamp}`;
    const ownerOtherSheet = `owner-other-sheet-${stamp}`;
    const otherSheet = `other-sheet-${stamp}`;
    const accessToken = `ya29.owner-access-${stamp}`;
    const refreshToken = `1//owner-refresh-${stamp}`;
    const otherAccessToken = `ya29.other-access-${stamp}`;

    await prisma.selectedSpreadsheet.createMany({
      data: [
        { userId: owner.user.id, spreadsheetId: ownerSheet, name: "Owner products" },
        {
          userId: owner.user.id,
          spreadsheetId: ownerOtherSheet,
          name: "Owner untouched",
        },
        { userId: other.user.id, spreadsheetId: otherSheet, name: "Other products" },
      ],
    });
    await prisma.googleConnection.createMany({
      data: [
        {
          userId: owner.user.id,
          googleAccountId: `google-${owner.user.id}`,
          accessToken,
          refreshToken,
          expiresAt: futureExpiry(),
        },
        {
          userId: other.user.id,
          googleAccountId: `google-${other.user.id}`,
          accessToken: otherAccessToken,
          refreshToken: `1//other-refresh-${stamp}`,
          expiresAt: futureExpiry(),
        },
      ],
    });
    const owned = await createApi(owner.user.id, ownerSheet, "owned");
    const untouched = await createApi(owner.user.id, ownerOtherSheet, "untouched");
    const foreign = await createApi(other.user.id, otherSheet, "foreign");
    const ownedKey = await prisma.apiKey.findUniqueOrThrow({
      where: { id: owned.keyId },
      select: { keyHash: true, revokedAt: true },
    });
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("disconnect must not call Google");
    };

    const invalid = await disconnectOwnedSpreadsheet(owner.user.id, "bad id");
    assert.equal(invalid.ok, false);
    assert.equal(invalid.ok ? "" : invalid.reason, "invalid");
    const missing = await disconnectOwnedSpreadsheet(
      owner.user.id,
      `missing-${stamp}`,
    );
    assert.equal(missing.ok, false);
    assert.equal(missing.ok ? "" : missing.reason, "not_found");
    const stolen = await disconnectOwnedSpreadsheet(owner.user.id, otherSheet);
    assert.equal(stolen.ok, false);

    const disconnected = await disconnectOwnedSpreadsheet(owner.user.id, ownerSheet);
    assert.equal(disconnected.ok, true);

    if (!disconnected.ok) {
      return;
    }

    assert.equal(disconnected.name, "Owner products");
    assert.equal(disconnected.affectedApis, 1);
    assert.equal(fetchCalls, 0);
    assert.equal(
      await prisma.selectedSpreadsheet.count({
        where: { userId: owner.user.id, spreadsheetId: ownerSheet },
      }),
      0,
    );
    assert.equal(
      await prisma.selectedSpreadsheet.count({
        where: { userId: owner.user.id, spreadsheetId: ownerOtherSheet },
      }),
      1,
    );
    assert.equal(
      await prisma.selectedSpreadsheet.count({
        where: { userId: other.user.id, spreadsheetId: otherSheet },
      }),
      1,
    );
    assert.equal(
      (
        await prisma.api.findUnique({
          where: { id: owned.api.id },
          select: { status: true, spreadsheetId: true },
        })
      )?.status,
      "ACTIVE",
    );
    assert.equal(
      (
        await prisma.apiKey.findUnique({
          where: { id: owned.keyId },
          select: { keyHash: true, revokedAt: true },
        })
      )?.keyHash,
      ownedKey.keyHash,
    );
    assert.equal(
      (
        await prisma.googleConnection.findUnique({
          where: { userId: owner.user.id },
          select: { accessToken: true },
        })
      )?.accessToken,
      accessToken,
    );

    const blocked = await callPublic(owned.api.slug, `Bearer ${owned.secret}`);
    assert.equal(blocked.status, 404);
    assert.equal(errorCode(blocked.body).code, "SPREADSHEET_NOT_FOUND");
    assert.equal(
      errorCode(blocked.body).message,
      SPREADSHEET_SELECTION_DISCONNECTED_MESSAGE,
    );
    assert.equal(Array.isArray(blocked.body), false);
    assert.equal(blocked.text.includes("Owner row"), false);
    assert.equal(blocked.text.includes(accessToken), false);
    assert.equal(fetchCalls, 0);

    const requests = installGoogle({
      valuesBySheet: {
        [ownerOtherSheet]: [
          ["id", "name"],
          ["2", "Untouched"],
        ],
        [otherSheet]: [
          ["id", "name"],
          ["3", "Foreign"],
        ],
        [ownerSheet]: [
          ["id", "name"],
          ["1", "Owner row"],
        ],
      },
    });
    const stillReadsUntouched = await callPublic(
      untouched.api.slug,
      `Bearer ${untouched.secret}`,
    );
    assert.equal(stillReadsUntouched.status, 200);
    assert.deepEqual(stillReadsUntouched.body, [{ id: "2", name: "Untouched" }]);
    const stillReadsForeign = await callPublic(
      foreign.api.slug,
      `Bearer ${foreign.secret}`,
    );
    assert.equal(stillReadsForeign.status, 200);
    assert.deepEqual(stillReadsForeign.body, [{ id: "3", name: "Foreign" }]);
    assert.equal(
      requests.some((request) => request.url.includes(ownerSheet)),
      false,
    );

    await prisma.selectedSpreadsheet.create({
      data: {
        userId: owner.user.id,
        spreadsheetId: ownerSheet,
        name: "Owner products",
      },
    });
    const restored = await callPublic(owned.api.slug, `Bearer ${owned.secret}`);
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.body, [{ id: "1", name: "Owner row" }]);
    assert.equal(restored.text.includes("Foreign"), false);
    assert.equal(restored.text.includes(accessToken), false);
    assert.equal(
      requests.some(
        (request) =>
          request.method === "DELETE" || request.url.includes("/drive/"),
      ),
      false,
    );
  });

  it("removes only the current Google authorization and reports revocation honestly", async () => {
    const owner = await createUser("google-owner");
    const other = await createUser("google-other");
    const ownerSheet = `google-owner-sheet-${stamp}`;
    const otherSheet = `google-other-sheet-${stamp}`;
    const accessToken = `ya29.disconnect-access-${stamp}`;
    const refreshToken = `1//disconnect-refresh-${stamp}`;
    const otherAccessToken = `ya29.other-kept-${stamp}`;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };

    await prisma.selectedSpreadsheet.createMany({
      data: [
        { userId: owner.user.id, spreadsheetId: ownerSheet, name: "Owner" },
        { userId: other.user.id, spreadsheetId: otherSheet, name: "Other" },
      ],
    });
    await prisma.googleConnection.create({
      data: {
        userId: owner.user.id,
        googleAccountId: `google-${owner.user.id}`,
        accessToken,
        refreshToken,
        expiresAt: futureExpiry(),
      },
    });
    await prisma.googleConnection.create({
      data: {
        userId: other.user.id,
        googleAccountId: `google-${other.user.id}`,
        accessToken: otherAccessToken,
        refreshToken: `1//other-kept-${stamp}`,
        expiresAt: futureExpiry(),
      },
    });
    const owned = await createApi(owner.user.id, ownerSheet, "gowned");
    const foreign = await createApi(other.user.id, otherSheet, "gforeign");
    const ownedKey = await prisma.apiKey.findUniqueOrThrow({
      where: { id: owned.keyId },
      select: { keyHash: true },
    });
    const requests = installGoogle({
      revokeStatus: 200,
      valuesBySheet: {
        [ownerSheet]: [
          ["id", "name"],
          ["1", "Owner row"],
        ],
        [otherSheet]: [
          ["id", "name"],
          ["9", "Foreign row"],
        ],
      },
    });

    const disconnected = await disconnectOwnedGoogleAccount(owner.user.id);
    assert.equal(disconnected.ok, true);

    if (!disconnected.ok) {
      return;
    }

    assert.equal(disconnected.revoked, true);
    assert.equal(disconnected.affectedApis, 1);
    assert.equal(disconnected.message.includes("confirmed"), true);
    assert.equal(JSON.stringify(disconnected).includes(accessToken), false);
    assert.equal(JSON.stringify(disconnected).includes(refreshToken), false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.method, "POST");
    assert.match(requests[0]?.url ?? "", /oauth2\.googleapis\.com\/revoke$/);
    assert.equal(
      requests[0]?.body.includes(encodeURIComponent(refreshToken)),
      true,
    );
    assert.equal(requests[0]?.body.includes(encodeURIComponent(accessToken)), false);
    assert.equal(
      await prisma.googleConnection.count({ where: { userId: owner.user.id } }),
      0,
    );
    assert.equal(
      (
        await prisma.googleConnection.findUnique({
          where: { userId: other.user.id },
          select: { accessToken: true },
        })
      )?.accessToken,
      otherAccessToken,
    );
    assert.equal(
      await prisma.selectedSpreadsheet.count({ where: { userId: owner.user.id } }),
      1,
    );
    assert.equal(
      (
        await prisma.api.findUnique({
          where: { id: owned.api.id },
          select: { status: true },
        })
      )?.status,
      "ACTIVE",
    );
    assert.equal(
      (
        await prisma.apiKey.findUnique({
          where: { id: owned.keyId },
          select: { keyHash: true },
        })
      )?.keyHash,
      ownedKey.keyHash,
    );
    assert.equal(
      (
        await prisma.user.findUnique({
          where: { id: owner.user.id },
          select: { email: true },
        })
      )?.email,
      owner.email,
    );

    const blocked = await callPublic(owned.api.slug, `Bearer ${owned.secret}`);
    assert.equal(blocked.status, 503);
    assert.equal(errorCode(blocked.body).code, "GOOGLE_NOT_CONNECTED");
    assert.equal(errorCode(blocked.body).message, GOOGLE_RECONNECT_REQUIRED_MESSAGE);
    assert.equal(blocked.text.includes("Owner row"), false);
    assert.equal(blocked.text.includes(accessToken), false);
    assert.equal(blocked.text.includes(refreshToken), false);
    const foreignRead = await callPublic(foreign.api.slug, `Bearer ${foreign.secret}`);
    assert.equal(foreignRead.status, 200);
    assert.deepEqual(foreignRead.body, [{ id: "9", name: "Foreign row" }]);

    const again = await disconnectOwnedGoogleAccount(owner.user.id);
    assert.equal(again.ok, false);
    assert.equal(requests.filter((request) => request.url.includes("revoke")).length, 1);

    await prisma.googleConnection.create({
      data: {
        userId: owner.user.id,
        googleAccountId: `google-${owner.user.id}-reconnected`,
        accessToken: `ya29.reconnected-${stamp}`,
        refreshToken: `1//reconnected-${stamp}`,
        expiresAt: futureExpiry(),
      },
    });
    const restored = await callPublic(owned.api.slug, `Bearer ${owned.secret}`);
    assert.equal(restored.status, 200);
    assert.deepEqual(restored.body, [{ id: "1", name: "Owner row" }]);
    assert.equal(restored.text.includes(refreshToken), false);
    assert.equal(JSON.stringify(logged).includes(accessToken), false);
    assert.equal(JSON.stringify(logged).includes(refreshToken), false);
  });

  it("keeps the local disconnect when Google does not confirm revocation", async () => {
    const owner = await createUser("revoke-fail");
    const accessToken = `ya29.revoke-fail-access-${stamp}`;
    const refreshToken = `1//revoke-fail-refresh-${stamp}`;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    await prisma.googleConnection.create({
      data: {
        userId: owner.user.id,
        googleAccountId: `google-${owner.user.id}`,
        accessToken,
        refreshToken,
        expiresAt: futureExpiry(),
      },
    });
    installGoogle({
      revokeStatus: 400,
      revokeBody: refreshToken,
    });

    const rejected = await disconnectOwnedGoogleAccount(owner.user.id);
    assert.equal(rejected.ok, true);

    if (!rejected.ok) {
      return;
    }

    assert.equal(rejected.revoked, false);
    assert.equal(rejected.message, GOOGLE_DISCONNECT_UNCONFIRMED_MESSAGE);
    assert.equal(rejected.message.includes("confirmed that this app's access was revoked"), false);
    assert.equal(JSON.stringify(rejected).includes(refreshToken), false);
    assert.equal(
      await prisma.googleConnection.count({ where: { userId: owner.user.id } }),
      0,
    );
    assert.equal(JSON.stringify(logged).includes(refreshToken), false);
    assert.equal(JSON.stringify(logged).includes(accessToken), false);

    await prisma.googleConnection.create({
      data: {
        userId: owner.user.id,
        googleAccountId: `google-${owner.user.id}`,
        accessToken,
        refreshToken: null,
        expiresAt: futureExpiry(),
      },
    });
    const requests = installGoogle({ revokeNetworkError: true });
    const offline = await disconnectOwnedGoogleAccount(owner.user.id);
    assert.equal(offline.ok, true);

    if (!offline.ok) {
      return;
    }

    assert.equal(offline.revoked, false);
    assert.equal(offline.message, GOOGLE_DISCONNECT_UNCONFIRMED_MESSAGE);
    assert.equal(requests[0]?.body.includes(encodeURIComponent(accessToken)), true);
    assert.equal(
      await prisma.googleConnection.count({ where: { userId: owner.user.id } }),
      0,
    );
    assert.equal(JSON.stringify(logged).includes(accessToken), false);

    const empty = await revokeGoogleToken("");
    assert.equal(empty.ok, false);
    assert.equal(requests.length, 1);
  });

  it("rejects unauthenticated, invalid, and unowned disconnect attempts", async () => {
    const owner = await createUser("http-owner");
    const other = await createUser("http-other");
    const ownerSheet = `http-owner-sheet-${stamp}`;
    const otherSheet = `http-other-sheet-${stamp}`;
    const accessToken = `ya29.http-access-${stamp}`;
    const refreshToken = `1//http-refresh-${stamp}`;
    const otherAccessToken = `ya29.http-other-access-${stamp}`;
    await prisma.selectedSpreadsheet.createMany({
      data: [
        { userId: owner.user.id, spreadsheetId: ownerSheet, name: "HTTP owner" },
        { userId: other.user.id, spreadsheetId: otherSheet, name: "HTTP other" },
      ],
    });
    await prisma.googleConnection.createMany({
      data: [
        {
          userId: owner.user.id,
          googleAccountId: `google-${owner.user.id}`,
          accessToken,
          refreshToken,
          expiresAt: futureExpiry(),
        },
        {
          userId: other.user.id,
          googleAccountId: `google-${other.user.id}`,
          accessToken: otherAccessToken,
          refreshToken: `1//http-other-refresh-${stamp}`,
          expiresAt: futureExpiry(),
        },
      ],
    });
    const owned = await createApi(owner.user.id, ownerSheet, "httpowned");
    const foreign = await createApi(other.user.id, otherSheet, "httpforeign");
    const ownerCookie = await login(owner.email);
    const otherCookie = await login(other.email);

    const signedOutSheet = await send(
      null,
      "DELETE",
      `/api/google/sheets/selection/${encodeURIComponent(ownerSheet)}`,
    );
    assert.equal(signedOutSheet.status, 401);
    assert.equal(errorCode(signedOutSheet.body).code, "UNAUTHORIZED");
    const signedOutGoogle = await send(null, "DELETE", "/api/auth/google");
    assert.equal(signedOutGoogle.status, 401);
    assert.equal(errorCode(signedOutGoogle.body).code, "UNAUTHORIZED");

    const invalid = await send(
      ownerCookie,
      "DELETE",
      `/api/google/sheets/selection/${encodeURIComponent("bad id")}`,
    );
    assert.equal(invalid.status, 400);
    assert.equal(errorCode(invalid.body).code, "INVALID_INPUT");
    const tooLong = await send(
      ownerCookie,
      "DELETE",
      `/api/google/sheets/selection/${"a".repeat(257)}`,
    );
    assert.equal(tooLong.status, 400);
    assert.equal(errorCode(tooLong.body).code, "INVALID_INPUT");
    const missing = await send(
      ownerCookie,
      "DELETE",
      `/api/google/sheets/selection/missing-${stamp}`,
    );
    assert.equal(missing.status, 404);
    assert.equal(errorCode(missing.body).code, "NOT_FOUND");

    const unowned = await send(
      ownerCookie,
      "DELETE",
      `/api/google/sheets/selection/${encodeURIComponent(otherSheet)}`,
      JSON.stringify({ userId: other.user.id }),
    );
    assert.equal(unowned.status, 404);
    assert.equal(
      await prisma.selectedSpreadsheet.count({
        where: { userId: other.user.id, spreadsheetId: otherSheet },
      }),
      1,
    );

    const removed = await send(
      ownerCookie,
      "DELETE",
      `/api/google/sheets/selection/${encodeURIComponent(ownerSheet)}`,
    );
    assert.equal(removed.status, 200);
    const removedText = JSON.stringify(removed.body);
    assert.equal(removedText.includes(accessToken), false);
    assert.equal(removedText.includes(refreshToken), false);
    assert.equal(
      (removed.body as { affectedApis?: unknown }).affectedApis,
      1,
    );
    assert.equal(
      await prisma.api.count({ where: { id: owned.api.id } }),
      1,
    );
    assert.equal(
      await prisma.apiKey.count({ where: { id: owned.keyId, revokedAt: null } }),
      1,
    );

    const ignoredUser = await send(
      otherCookie,
      "DELETE",
      "/api/auth/google",
      JSON.stringify({ userId: owner.user.id }),
    );
    assert.equal(ignoredUser.status, 200);
    const ignoredBody = ignoredUser.body as { revoked?: unknown; message?: unknown };
    assert.equal(ignoredBody.revoked, false);
    assert.equal(ignoredBody.message, GOOGLE_DISCONNECT_UNCONFIRMED_MESSAGE);
    assert.equal(JSON.stringify(ignoredUser.body).includes(otherAccessToken), false);
    assert.equal(
      await prisma.googleConnection.count({ where: { userId: other.user.id } }),
      0,
    );
    assert.equal(
      await prisma.selectedSpreadsheet.count({
        where: { userId: other.user.id, spreadsheetId: otherSheet },
      }),
      1,
    );
    assert.equal(
      (
        await prisma.googleConnection.findUnique({
          where: { userId: owner.user.id },
          select: { accessToken: true },
        })
      )?.accessToken,
      accessToken,
    );
    assert.equal(
      await prisma.api.count({ where: { id: foreign.api.id, status: "ACTIVE" } }),
      1,
    );
    assert.equal(
      await prisma.apiKey.count({ where: { id: foreign.keyId, revokedAt: null } }),
      1,
    );

    const missingGoogle = await send(otherCookie, "DELETE", "/api/auth/google");
    assert.equal(missingGoogle.status, 404);
    assert.equal(errorCode(missingGoogle.body).code, "GOOGLE_NOT_CONNECTED");
    assert.equal(
      await prisma.user.count({ where: { id: other.user.id } }),
      1,
    );
  });
});

async function login(email: string) {
  const response = await originalFetch(`${baseUrl}/api/auth/login`, {
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

async function send(
  cookie: string | null,
  method: string,
  path: string,
  body?: string,
) {
  const headers = new Headers();

  if (cookie) {
    headers.set("cookie", cookie);
  }

  if (body != null) {
    headers.set("content-type", "application/json");
  }

  const response = await originalFetch(`${baseUrl}${path}`, {
    method,
    headers,
    body,
    cache: "no-store",
  });
  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  return { status: response.status, body: parsed, text };
}
