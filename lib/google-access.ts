import {
  accessTokenNeedsRefresh,
  GoogleTokenRefreshError,
  refreshGoogleAccessToken,
} from "@/lib/google";
import { GoogleDriveError } from "@/lib/google-sheets";
import { GoogleSheetsError } from "@/lib/google-worksheets";
import { prisma } from "@/lib/prisma";
import {
  isSealedSecret,
  isTokenEncryptionEnabled,
  openSecret,
  openSecretIfPresent,
  sealSecret,
  sealSecretIfNeeded,
} from "@/lib/token-crypto";

type StoredGoogleConnection = {
  userId: number;
  /** Plaintext access token (already decrypted if the DB row was sealed). */
  accessToken: string;
  /** Plaintext refresh token (already decrypted if the DB row was sealed). */
  refreshToken: string | null;
  expiresAt: Date;
  /**
   * When true, rewrite plaintext DB rows with sealed values on next use
   * (lazy migration after TOKEN_ENCRYPTION_KEY is configured).
   */
  resealLegacy?: boolean;
};

export function createGoogleAccessTokenResolver(
  connection: StoredGoogleConnection,
) {
  let accessToken = connection.accessToken;
  let refreshToken = connection.refreshToken;
  let expiresAt = connection.expiresAt;
  let didRefresh = false;
  let pendingLegacyRewrite = connection.resealLegacy === true;

  async function rewriteSealedTokens() {
    try {
      await prisma.googleConnection.update({
        where: { userId: connection.userId },
        data: {
          accessToken: sealSecret(accessToken),
          refreshToken: sealSecretIfNeeded(refreshToken),
        },
      });
      pendingLegacyRewrite = false;
    } catch {
      // Leave plaintext in place; the next refresh will seal.
    }
  }

  return {
    get didRefresh() {
      return didRefresh;
    },
    async resolve(force = false) {
      if (!force && !accessTokenNeedsRefresh(expiresAt)) {
        if (pendingLegacyRewrite) {
          await rewriteSealedTokens();
        }

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
          accessToken: sealSecret(tokens.accessToken),
          refreshToken: sealSecretIfNeeded(nextRefreshToken),
          expiresAt: tokens.expiresAt,
        },
      });

      accessToken = tokens.accessToken;
      refreshToken = nextRefreshToken;
      expiresAt = tokens.expiresAt;
      didRefresh = true;
      pendingLegacyRewrite = false;

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

  const accessTokenPlain = openSecret(connection.accessToken);
  const refreshTokenPlain = openSecretIfPresent(connection.refreshToken);
  const resolver = createGoogleAccessTokenResolver({
    userId,
    accessToken: accessTokenPlain,
    refreshToken: refreshTokenPlain,
    expiresAt: connection.expiresAt,
    resealLegacy: needsLegacyReseal(
      connection.accessToken,
      connection.refreshToken,
    ),
  });
  const accessToken = await resolver.resolve();

  try {
    return await run(accessToken);
  } catch (error) {
    if (
      !isUnauthorizedGoogleError(error) ||
      resolver.didRefresh ||
      !refreshTokenPlain
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

export function needsLegacyReseal(
  storedAccessToken: string,
  storedRefreshToken: string | null,
) {
  if (!isTokenEncryptionEnabled()) {
    return false;
  }

  return (
    !isSealedSecret(storedAccessToken) ||
    (storedRefreshToken != null && !isSealedSecret(storedRefreshToken))
  );
}
