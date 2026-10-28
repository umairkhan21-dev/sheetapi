import { revokeGoogleToken } from "@/lib/google";
import {
  GOOGLE_DISCONNECT_REVOKED_MESSAGE,
  GOOGLE_DISCONNECT_UNCONFIRMED_MESSAGE,
} from "@/lib/google-disconnect-copy";
import { isGoogleFileId } from "@/lib/google-sheets";
import { prisma } from "@/lib/prisma";
import { openSecret, openSecretIfPresent } from "@/lib/token-crypto";

export async function disconnectOwnedSpreadsheet(
  userId: number,
  spreadsheetId: string,
) {
  if (!isGoogleFileId(spreadsheetId)) {
    return { ok: false as const, reason: "invalid" as const };
  }

  const saved = await prisma.selectedSpreadsheet.findUnique({
    where: {
      userId_spreadsheetId: {
        userId,
        spreadsheetId,
      },
    },
    select: {
      id: true,
      spreadsheetId: true,
      name: true,
    },
  });

  if (!saved) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const affectedApis = await prisma.api.count({
    where: {
      userId,
      spreadsheetId,
    },
  });
  const deleted = await prisma.selectedSpreadsheet.deleteMany({
    where: {
      id: saved.id,
      userId,
      spreadsheetId,
    },
  });

  if (deleted.count !== 1) {
    return { ok: false as const, reason: "not_found" as const };
  }

  return {
    ok: true as const,
    spreadsheetId: saved.spreadsheetId,
    name: saved.name,
    affectedApis,
  };
}

export async function disconnectOwnedGoogleAccount(userId: number) {
  const connection = await prisma.googleConnection.findUnique({
    where: { userId },
    select: {
      accessToken: true,
      refreshToken: true,
    },
  });

  if (!connection) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const refreshToken = openSecretIfPresent(connection.refreshToken);
  const accessToken = openSecret(connection.accessToken);
  const revocation = await revokeGoogleToken(refreshToken ?? accessToken);
  const deleted = await prisma.googleConnection.deleteMany({
    where: { userId },
  });

  if (deleted.count !== 1) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const affectedApis = await prisma.api.count({
    where: { userId },
  });

  return {
    ok: true as const,
    revoked: revocation.ok,
    affectedApis,
    message: revocation.ok
      ? GOOGLE_DISCONNECT_REVOKED_MESSAGE
      : GOOGLE_DISCONNECT_UNCONFIRMED_MESSAGE,
  };
}
