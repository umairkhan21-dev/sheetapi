import {
  accessTokenNeedsRefresh,
  GoogleTokenRefreshError,
  refreshGoogleAccessToken,
} from "@/lib/google";
import { GoogleDriveError } from "@/lib/google-sheets";
import { GoogleSheetsError } from "@/lib/google-worksheets";
import { prisma } from "@/lib/prisma";

type StoredGoogleConnection = {
  userId: number;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
};

export function createGoogleAccessTokenResolver(
  connection: StoredGoogleConnection,
) {
  let accessToken = connection.accessToken;
  let refreshToken = connection.refreshToken;
  let expiresAt = connection.expiresAt;
  let didRefresh = false;

  return {
    get didRefresh() {
      return didRefresh;
    },
    async resolve(force = false) {
      if (!force && !accessTokenNeedsRefresh(expiresAt)) {
        return accessToken;
      }

      if (!refreshToken) {
        throw new GoogleTokenRefreshError(true);
      }

      const tokens = await refreshGoogleAccessToken(refreshToken);
      const nextRefreshToken = tokens.refreshToken ?? refreshToken;

      await prisma.googleConnection.update({
        where: { userId: connection.userId },
        data: {
          accessToken: tokens.accessToken,
          refreshToken: nextRefreshToken,
          expiresAt: tokens.expiresAt,
        },
      });

      accessToken = tokens.accessToken;
      refreshToken = nextRefreshToken;
      expiresAt = tokens.expiresAt;
      didRefresh = true;

      return accessToken;
    },
  };
}

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("Google Sheets is not connected");
    this.name = "GoogleNotConnectedError";
  }
}

export async function withGoogleAccessToken<T>(
  userId: number,
  run: (accessToken: string) => Promise<T>,
): Promise<T> {
  const connection = await prisma.googleConnection.findUnique({
    where: { userId },
    select: {
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
    },
  });

  if (!connection) {
    throw new GoogleNotConnectedError();
  }

  const resolver = createGoogleAccessTokenResolver({
    userId,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    expiresAt: connection.expiresAt,
  });
  const accessToken = await resolver.resolve();

  try {
    return await run(accessToken);
  } catch (error) {
    if (
      !isUnauthorizedGoogleError(error) ||
      resolver.didRefresh ||
      !connection.refreshToken
    ) {
      throw error;
    }

    return run(await resolver.resolve(true));
  }
}

function isUnauthorizedGoogleError(error: unknown) {
  return (
    (error instanceof GoogleDriveError || error instanceof GoogleSheetsError) &&
    error.httpStatus === 401
  );
}
