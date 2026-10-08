import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_DRIVE_FILE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_ABOUT_URL = "https://www.googleapis.com/drive/v3/about";
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;
const ACCESS_TOKEN_EXPIRY_SKEW_MS = 60_000;
const OAUTH_ERROR_CODE_PATTERN = /^[a-z0-9_]+$/i;

export class GoogleOAuthConfigError extends Error {
  constructor() {
    super("Google OAuth is not configured");
    this.name = "GoogleOAuthConfigError";
  }
}

export class GoogleOAuthExchangeError extends Error {
  constructor() {
    super("Google token exchange failed");
    this.name = "GoogleOAuthExchangeError";
  }
}

export class GoogleAccountLookupError extends Error {
  constructor() {
    super("Google account lookup failed");
    this.name = "GoogleAccountLookupError";
  }
}

export class GoogleTokenRefreshError extends Error {
  readonly reauthRequired: boolean;

  constructor(reauthRequired: boolean) {
    super(
      reauthRequired
        ? "Google reauthorization required"
        : "Google token refresh failed",
    );
    this.name = "GoogleTokenRefreshError";
    this.reauthRequired = reauthRequired;
  }
}

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
};

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function googleOAuthStateCookieOptions(
  maxAge = OAUTH_STATE_MAX_AGE_SECONDS,
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge,
  };
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function oauthStatesMatch(expected: string, received: string) {
  const expectedDigest = createHash("sha256").update(expected).digest();
  const receivedDigest = createHash("sha256").update(received).digest();

  return timingSafeEqual(expectedDigest, receivedDigest);
}

function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new GoogleOAuthConfigError();
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const url = new URL(GOOGLE_AUTHORIZATION_URL);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DRIVE_FILE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  return url;
}

export async function exchangeGoogleAuthorizationCode(
  code: string,
): Promise<GoogleTokens> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  let response: Response;

  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new GoogleOAuthExchangeError();
  }

  if (!response.ok) {
    throw new GoogleOAuthExchangeError();
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new GoogleOAuthExchangeError();
  }

  return parseTokenResponse(payload);
}

export function accessTokenNeedsRefresh(expiresAt: Date, now = Date.now()) {
  return expiresAt.getTime() - now <= ACCESS_TOKEN_EXPIRY_SKEW_MS;
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<GoogleTokens> {
  if (refreshToken.length === 0 || refreshToken.length > 8192) {
    throw new GoogleTokenRefreshError(true);
  }

  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  let response: Response;

  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new GoogleTokenRefreshError(false);
  }

  if (!response.ok) {
    const errorCode = await readOAuthErrorCode(response);
    throw new GoogleTokenRefreshError(errorCode === "invalid_grant");
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new GoogleTokenRefreshError(false);
  }

  try {
    const tokens = parseTokenResponse(payload);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? refreshToken,
      expiresAt: tokens.expiresAt,
    };
  } catch {
    throw new GoogleTokenRefreshError(false);
  }
}

export async function fetchGoogleAccountId(accessToken: string) {
  const url = new URL(GOOGLE_DRIVE_ABOUT_URL);
  url.searchParams.set("fields", "user(permissionId)");

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new GoogleAccountLookupError();
  }

  if (!response.ok) {
    throw new GoogleAccountLookupError();
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new GoogleAccountLookupError();
  }

  return parseGoogleAccountId(payload);
}

async function readOAuthErrorCode(response: Response) {
  try {
    const payload: unknown = await response.json();

    if (typeof payload !== "object" || payload === null) {
      return null;
    }

    const error = (payload as { error?: unknown }).error;

    if (
      typeof error !== "string" ||
      error.length === 0 ||
      error.length > 64 ||
      !OAUTH_ERROR_CODE_PATTERN.test(error)
    ) {
      return null;
    }

    return error;
  } catch {
    return null;
  }
}

function parseTokenResponse(payload: unknown): GoogleTokens {
  if (typeof payload !== "object" || payload === null) {
    throw new GoogleOAuthExchangeError();
  }

  const record = payload as Record<string, unknown>;
  const accessToken = record.access_token;
  const expiresIn = record.expires_in;
  const refreshToken = record.refresh_token;
  const tokenType = record.token_type;

  if (
    typeof accessToken !== "string" ||
    accessToken.length === 0 ||
    accessToken.length > 8192
  ) {
    throw new GoogleOAuthExchangeError();
  }

  if (typeof tokenType !== "string" || tokenType.toLowerCase() !== "bearer") {
    throw new GoogleOAuthExchangeError();
  }

  if (
    typeof expiresIn !== "number" ||
    !Number.isInteger(expiresIn) ||
    expiresIn <= 0 ||
    expiresIn > 60 * 60 * 24
  ) {
    throw new GoogleOAuthExchangeError();
  }

  let parsedRefreshToken: string | null = null;

  if (refreshToken != null) {
    if (
      typeof refreshToken !== "string" ||
      refreshToken.length === 0 ||
      refreshToken.length > 8192
    ) {
      throw new GoogleOAuthExchangeError();
    }

    parsedRefreshToken = refreshToken;
  }

  return {
    accessToken,
    refreshToken: parsedRefreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

function parseGoogleAccountId(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    throw new GoogleAccountLookupError();
  }

  const user = (payload as { user?: unknown }).user;

  if (typeof user !== "object" || user === null) {
    throw new GoogleAccountLookupError();
  }

  const permissionId = (user as { permissionId?: unknown }).permissionId;

  if (
    typeof permissionId !== "string" ||
    permissionId.length === 0 ||
    permissionId.length > 191 ||
    /\s/.test(permissionId)
  ) {
    throw new GoogleAccountLookupError();
  }

  return permissionId;
}
