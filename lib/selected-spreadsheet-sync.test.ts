import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, afterEach, describe, it } from "node:test";
import { readSpreadsheetList } from "../app/dashboard/save-spreadsheet-selection";
import { prisma } from "./prisma";
import { syncSelectedSpreadsheetNames } from "./selected-spreadsheet-sync";

const originalFetch = globalThis.fetch;
const createdEmails: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

after(async () => {
  if (createdEmails.length > 0) {
    await prisma.user.deleteMany({
      where: { email: { in: createdEmails } },
    });
  }

  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});

describe("saved spreadsheet name sync", () => {
  it("replaces a stored name with the Drive name for the same file id", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const spreadsheetId = `rename-${owner.user.id}`;
    const otherId = `other-${other.user.id}`;
    await prisma.googleConnection.create({
      data: {
        userId: owner.user.id,
        googleAccountId: `google-${owner.user.id}`,
        accessToken: "rename-access-token",
        refreshToken: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const saved = await prisma.selectedSpreadsheet.create({
      data: {
        userId: owner.user.id,
        spreadsheetId,
        name: "oldtest",
        modifiedTime: new Date("2026-10-01T00:00:00.000Z"),
      },
    });
    await prisma.selectedSpreadsheet.create({
      data: {
        userId: other.user.id,
        spreadsheetId: otherId,
        name: "other-old",
      },
    });
    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer rename-access-token");
      assert.equal(url.includes("rename-access-token"), false);

      return Response.json({
        files: [
          {
            id: spreadsheetId,
            name: "newtest2",
            mimeType: "application/vnd.google-apps.spreadsheet",
            modifiedTime: "2026-10-15T00:00:00.000Z",
          },
          {
            id: otherId,
            name: "should-not-apply",
            mimeType: "application/vnd.google-apps.spreadsheet",
            modifiedTime: "2026-10-15T00:00:00.000Z",
          },
        ],
      });
    };

    const synced = await syncSelectedSpreadsheetNames(owner.user.id);
    const dropdown = readSpreadsheetList({
      success: true,
      spreadsheets: synced.map((spreadsheet) => ({
        id: spreadsheet.spreadsheetId,
        name: spreadsheet.name,
        modifiedTime: spreadsheet.modifiedTime?.toISOString() ?? null,
      })),
    });
    const stored = await prisma.selectedSpreadsheet.findUnique({
      where: { id: saved.id },
    });
    const untouched = await prisma.selectedSpreadsheet.findUnique({
      where: {
        userId_spreadsheetId: {
          userId: other.user.id,
          spreadsheetId: otherId,
        },
      },
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(dropdown, [
      {
        id: spreadsheetId,
        name: "newtest2",
        modifiedTime: "2026-10-15T00:00:00.000Z",
      },
    ]);
    assert.equal(stored?.spreadsheetId, spreadsheetId);
    assert.equal(stored?.name, "newtest2");
    assert.equal(stored?.modifiedTime?.toISOString(), "2026-10-15T00:00:00.000Z");
    assert.equal(untouched?.name, "other-old");
  });

  it("keeps the stored name when Drive fails or the file is not listed", async () => {
    const owner = await createUser("fallback");
    const listedId = `listed-${owner.user.id}`;
    const missingId = `missing-${owner.user.id}`;
    await prisma.googleConnection.create({
      data: {
        userId: owner.user.id,
        googleAccountId: `google-${owner.user.id}`,
        accessToken: "fallback-access-token",
        refreshToken: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await prisma.selectedSpreadsheet.createMany({
      data: [
        {
          userId: owner.user.id,
          spreadsheetId: listedId,
          name: "Keep listed",
        },
        {
          userId: owner.user.id,
          spreadsheetId: missingId,
          name: "Keep missing",
        },
      ],
    });

    globalThis.fetch = async () => new Response("down", { status: 500 });
    const failed = await syncSelectedSpreadsheetNames(owner.user.id);
    assert.deepEqual(
      failed.map((spreadsheet) => spreadsheet.name).sort(),
      ["Keep listed", "Keep missing"],
    );
    assert.equal(await prisma.selectedSpreadsheet.count({ where: { userId: owner.user.id } }), 2);

    globalThis.fetch = async () =>
      Response.json({
        files: [
          {
            id: listedId,
            name: "Keep listed",
            mimeType: "application/vnd.google-apps.spreadsheet",
            modifiedTime: "2026-10-02T00:00:00.000Z",
          },
        ],
      });
    const partial = await syncSelectedSpreadsheetNames(owner.user.id);
    const missing = partial.find((spreadsheet) => spreadsheet.spreadsheetId === missingId);
    const listed = partial.find((spreadsheet) => spreadsheet.spreadsheetId === listedId);

    assert.equal(missing?.name, "Keep missing");
    assert.equal(listed?.name, "Keep listed");
    assert.equal(
      (
        await prisma.selectedSpreadsheet.findUnique({
          where: {
            userId_spreadsheetId: {
              userId: owner.user.id,
              spreadsheetId: missingId,
            },
          },
        })
      )?.name,
      "Keep missing",
    );
  });

  it("does not call Drive when the account has no Google connection", async () => {
    const owner = await createUser("offline");
    await prisma.selectedSpreadsheet.create({
      data: {
        userId: owner.user.id,
        spreadsheetId: `offline-${owner.user.id}`,
        name: "Stored only",
      },
    });
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("Drive should not be called");
    };

    const synced = await syncSelectedSpreadsheetNames(owner.user.id);

    assert.equal(calls, 0);
    assert.deepEqual(
      synced.map((spreadsheet) => spreadsheet.name),
      ["Stored only"],
    );
  });
});

async function createUser(label: string) {
  const email = `sheet-sync-${Date.now()}-${randomBytes(3).toString("hex")}-${label}@example.com`;
  createdEmails.push(email);

  const user = await prisma.user.create({
    data: {
      name: "Spreadsheet sync",
      email,
      password: "not-used",
    },
  });

  return { user, email };
}
