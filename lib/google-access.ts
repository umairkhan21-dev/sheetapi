import {
  accessTokenNeedsRefresh,
  GoogleTokenRefreshError,
  refreshGoogleAccessToken,
} from "@/lib/google";
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
