import "dotenv/config";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { GET } from "../app/api/v1/[slug]/route";
import { generateApiKey, hashApiKey } from "./api-key";
import {
  createOwnedApiKey,
  listOwnedApiKeys,
  revokeOwnedApiKey,
} from "./api-key-store";
import { prisma } from "./prisma";

const stamp = Date.now();
const ownerEmail = `api-key-milestone-${stamp}-owner@example.com`;
const otherEmail = `api-key-milestone-${stamp}-other@example.com`;

async function callPublic(
  slug: string,
  authorization?: string,
  query = "",
) {
  const headers = new Headers();

  if (authorization) {
    headers.set("authorization", authorization);
  }

  const response = await GET(
    new Request(`http://localhost/api/v1/${slug}${query}`, { headers }),
    { params: Promise.resolve({ slug }) },
  );
  const body: unknown = await response.json();

  return { status: response.status, body };
}

function errorCode(body: unknown) {
  assert.equal(Array.isArray(body), false);
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  const record = body as {
    success?: unknown;
    error?: { code?: unknown; message?: unknown };
  };
  assert.equal(record.success, false);
  return {
    code: record.error?.code,
    message: record.error?.message,
  };
}

describe("API key verification", () => {
  it("rejects missing and unusable keys before reading Google Sheets", async () => {
    const owner = await prisma.user.create({
      data: {
        name: "API key owner",
        email: ownerEmail,
        password: "not-used",
      },
    });
    const other = await prisma.user.create({
      data: {
        name: "API key other",
        email: otherEmail,
        password: "not-used",
      },
    });
    const hidden = await prisma.api.create({
      data: {
        userId: owner.id,
        name: "Hidden sheet",
        slug: `ak${stamp}a`,
        spreadsheetId: `sheet-a-${stamp}`,
        worksheetId: 0,
        worksheetName: "Sheet1",
        status: "ACTIVE",
      },
    });
    const readable = await prisma.api.create({
      data: {
        userId: owner.id,
        name: "Readable sheet",
        slug: `ak${stamp}b`,
        spreadsheetId: `sheet-b-${stamp}`,
        worksheetId: 0,
        worksheetName: "Sheet1",
        status: "ACTIVE",
      },
    });

    try {
      await prisma.selectedSpreadsheet.create({
        data: {
          userId: owner.id,
          spreadsheetId: readable.spreadsheetId,
          name: "Readable",
        },
      });

      const created = await createOwnedApiKey(owner.id, readable.id, "Website");
      assert.equal(created.ok, true);

      if (!created.ok) {
        return;
      }

      const stored = await prisma.apiKey.findUnique({
        where: { id: created.key.id },
      });
      assert.ok(stored);
      assert.equal(stored.keyHash, hashApiKey(created.secret));
      assert.notEqual(stored.keyHash, created.secret);
      assert.equal(JSON.stringify(stored).includes(created.secret), false);
      assert.equal(created.secret.startsWith(stored.keyPrefix), true);
      assert.notEqual(stored.keyPrefix, created.secret);

      const listed = await listOwnedApiKeys(owner.id, readable.id);
      assert.ok(listed);
      assert.equal(listed?.some((key) => key.id === created.key.id), true);
      assert.equal(JSON.stringify(listed).includes(created.secret), false);
      assert.equal(JSON.stringify(listed).includes(stored.keyHash), false);
      assert.equal(await listOwnedApiKeys(other.id, readable.id), null);
      assert.equal(
        (await createOwnedApiKey(other.id, readable.id, "Stolen")).ok,
        false,
      );
      assert.equal(
        (await revokeOwnedApiKey(other.id, readable.id, created.key.id)).ok,
        false,
      );

      const missing = await callPublic(readable.slug);
      assert.equal(missing.status, 401);
      assert.deepEqual(errorCode(missing.body), {
        code: "INVALID_API_KEY",
        message: "A valid API key is required.",
      });

      const fromQuery = await callPublic(
        readable.slug,
        undefined,
        `?api_key=${encodeURIComponent(created.secret)}`,
      );
      assert.equal(fromQuery.status, 401);
      assert.equal(errorCode(fromQuery.body).code, "INVALID_API_KEY");

      const headerOnly = new Headers();
      headerOnly.set("x-api-key", created.secret);
      const alternateHeader = await GET(
        new Request(`http://localhost/api/v1/${readable.slug}`, {
          headers: headerOnly,
        }),
        { params: Promise.resolve({ slug: readable.slug }) },
      );
      assert.equal(alternateHeader.status, 401);

      const malformed = await callPublic(readable.slug, "Bearer sk_live_short");
      assert.equal(malformed.status, 401);
      assert.equal(
        errorCode(malformed.body).message,
        "The API key is invalid or revoked.",
      );

      const unknown = generateApiKey();
      const invalid = await callPublic(readable.slug, `Bearer ${unknown.secret}`);
      assert.equal(invalid.status, 401);
      assert.equal(errorCode(invalid.body).code, "INVALID_API_KEY");

      const otherApiKey = await createOwnedApiKey(owner.id, hidden.id, "Other API");
      assert.equal(otherApiKey.ok, true);

      if (!otherApiKey.ok) {
        return;
      }

      const wrongApi = await callPublic(
        readable.slug,
        `Bearer ${otherApiKey.secret}`,
      );
      assert.equal(wrongApi.status, 401);
      assert.equal(JSON.stringify(wrongApi.body).includes(otherApiKey.secret), false);

      const unused = await prisma.apiKey.findUnique({
        where: { id: created.key.id },
        select: { lastUsedAt: true },
      });
      assert.equal(unused?.lastUsedAt, null);

      const accepted = await callPublic(readable.slug, `Bearer ${created.secret}`);
      assert.equal(accepted.status, 503);
      assert.equal(errorCode(accepted.body).code, "GOOGLE_NOT_CONNECTED");
      assert.equal(Array.isArray(accepted.body), false);
      assert.equal(JSON.stringify(accepted.body).includes(created.secret), false);
      const used = await prisma.apiKey.findUnique({
        where: { id: created.key.id },
        select: { lastUsedAt: true },
      });
      assert.ok(used?.lastUsedAt);

      await prisma.api.update({
        where: { id: readable.id },
        data: { status: "DISABLED" },
      });
      const disabledKey = await createOwnedApiKey(owner.id, readable.id, "Disabled");
      assert.equal(disabledKey.ok, true);

      if (!disabledKey.ok) {
        return;
      }

      const disabled = await callPublic(
        readable.slug,
        `Bearer ${disabledKey.secret}`,
      );
      assert.equal(disabled.status, 403);
      assert.equal(errorCode(disabled.body).code, "API_DISABLED");
      const disabledRow = await prisma.apiKey.findUnique({
        where: { id: disabledKey.key.id },
        select: { lastUsedAt: true },
      });
      assert.equal(disabledRow?.lastUsedAt, null);

      await prisma.api.update({
        where: { id: readable.id },
        data: { status: "ACTIVE" },
      });
      const revokedKey = await createOwnedApiKey(owner.id, readable.id, "Revoked");
      assert.equal(revokedKey.ok, true);

      if (!revokedKey.ok) {
        return;
      }

      const revoked = await revokeOwnedApiKey(
        owner.id,
        readable.id,
        revokedKey.key.id,
      );
      assert.equal(revoked.ok, true);

      if (revoked.ok) {
        assert.notEqual(revoked.key.revokedAt, null);
        assert.equal(JSON.stringify(revoked.key).includes(revokedKey.secret), false);
      }

      const revokedCall = await callPublic(
        readable.slug,
        `Bearer ${revokedKey.secret}`,
      );
      assert.equal(revokedCall.status, 401);
      assert.equal(errorCode(revokedCall.body).code, "INVALID_API_KEY");

      const hiddenCall = await callPublic(hidden.slug, `Bearer ${created.secret}`);
      assert.equal(hiddenCall.status, 401);
    } finally {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [ownerEmail, otherEmail],
          },
        },
      });
    }
  });
});

after(async () => {
  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});
