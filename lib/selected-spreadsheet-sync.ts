import {
  GoogleOAuthConfigError,
  GoogleTokenRefreshError,
} from "@/lib/google";
import {
  createGoogleAccessTokenResolver,
  needsLegacyReseal,
} from "@/lib/google-access";
import {
  GoogleDriveError,
  listGoogleSpreadsheets,
  type SpreadsheetSummary,
} from "@/lib/google-sheets";
import { prisma } from "@/lib/prisma";
import { openSecret, openSecretIfPresent } from "@/lib/token-crypto";

export type SavedSpreadsheetRecord = {
  spreadsheetId: string;
  name: string;
  modifiedTime: Date | null;
};

// Drive file ids stay the same when a spreadsheet is renamed. Saved rows
// keep the name from the last select until this refresh copies the current
// Drive name. A Drive failure keeps the stored row.
export async function syncSelectedSpreadsheetNames(
  userId: number,
): Promise<SavedSpreadsheetRecord[]> {
  const selections = await prisma.selectedSpreadsheet.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      spreadsheetId: true,
      name: true,
      modifiedTime: true,
    },
  });

  if (selections.length === 0) {
    return [];
  }

  const connection = await prisma.googleConnection.findUnique({
    where: { userId },
    select: {
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
    },
  });

  if (!connection) {
    return selections.map(toRecord);
  }

  let live: SpreadsheetSummary[];

  try {
    const refreshTokenPlain = openSecretIfPresent(connection.refreshToken);
    const accessTokens = createGoogleAccessTokenResolver({
      userId,
      accessToken: openSecret(connection.accessToken),
      refreshToken: refreshTokenPlain,
      expiresAt: connection.expiresAt,
      resealLegacy: needsLegacyReseal(
        connection.accessToken,
        connection.refreshToken,
      ),
    });
    let accessToken = await accessTokens.resolve();

    try {
      live = await listGoogleSpreadsheets(accessToken);
    } catch (error) {
      if (
        error instanceof GoogleDriveError &&
        error.httpStatus === 401 &&
        !accessTokens.didRefresh &&
        refreshTokenPlain
      ) {
        accessToken = await accessTokens.resolve(true);
        live = await listGoogleSpreadsheets(accessToken);
      } else {
        throw error;
      }
    }
  } catch (error) {
    logSyncFailure(error);
    return selections.map(toRecord);
  }

  const byId = new Map(live.map((spreadsheet) => [spreadsheet.id, spreadsheet]));
  const refreshed: SavedSpreadsheetRecord[] = [];

  for (const saved of selections) {
    const current = byId.get(saved.spreadsheetId);

    if (!current) {
      refreshed.push(toRecord(saved));
      continue;
    }

    const modifiedTime = toModifiedTime(current.modifiedTime);
    const nameChanged = saved.name !== current.name;
    const timeChanged = !sameSecond(saved.modifiedTime, modifiedTime);

    if (!nameChanged && !timeChanged) {
      refreshed.push(toRecord(saved));
      continue;
    }

    const updated = await prisma.selectedSpreadsheet.update({
      where: { id: saved.id },
      data: {
        name: current.name,
        modifiedTime,
      },
      select: {
        spreadsheetId: true,
        name: true,
        modifiedTime: true,
      },
    });
    refreshed.push(updated);
  }

  return refreshed;
}

function toRecord(spreadsheet: SavedSpreadsheetRecord): SavedSpreadsheetRecord {
  return {
    spreadsheetId: spreadsheet.spreadsheetId,
    name: spreadsheet.name,
    modifiedTime: spreadsheet.modifiedTime,
  };
}

function toModifiedTime(value: string | null) {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);

  if (!Number.isFinite(time)) {
    return null;
  }

  return new Date(time);
}

function sameSecond(left: Date | null, right: Date | null) {
  if (left == null || right == null) {
    return left == null && right == null;
  }

  return Math.floor(left.getTime() / 1000) === Math.floor(right.getTime() / 1000);
}

function logSyncFailure(error: unknown) {
  if (error instanceof GoogleOAuthConfigError) {
    console.error("Saved spreadsheet name sync is not configured");
    return;
  }

  if (error instanceof GoogleTokenRefreshError) {
    console.error(
      error.reauthRequired
        ? "Saved spreadsheet name sync requires reconnect"
        : "Saved spreadsheet name sync refresh failed",
    );
    return;
  }

  if (error instanceof GoogleDriveError) {
    console.error("Saved spreadsheet name sync failed", error.httpStatus);
    return;
  }

  console.error(
    "Saved spreadsheet name sync failed",
    error instanceof Error ? error.name : "UnknownError",
  );
}
