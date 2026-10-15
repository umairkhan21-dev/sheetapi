import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_DRIVE_FILE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
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

export type GoogleApiErrorInfo = {
  httpStatus: number | null;
  googleError: string | null;
  googleReason: string | null;
  googleStatus: string | null;
  googleMessage: string | null;
};

const EMPTY_GOOGLE_API_ERROR: GoogleApiErrorInfo = {
  httpStatus: null,
  googleError: null,
  googleReason: null,
  googleStatus: null,
  googleMessage: null,
};

export class GoogleOAuthExchangeError extends Error {
  readonly httpStatus: number | null;
  readonly googleError: string | null;
  readonly googleReason: string | null;
  readonly googleStatus: string | null;
  readonly googleMessage: string | null;

  constructor(info: GoogleApiErrorInfo = EMPTY_GOOGLE_API_ERROR) {
    super("Google token exchange failed");
    this.name = "GoogleOAuthExchangeError";
    this.httpStatus = info.httpStatus;
    this.googleError = info.googleError;
    this.googleReason = info.googleReason;
    this.googleStatus = info.googleStatus;
    this.googleMessage = info.googleMessage;
  }
}

export class GoogleAccountLookupError extends Error {
  readonly httpStatus: number | null;
  readonly googleError: string | null;
  readonly googleReason: string | null;
  readonly googleStatus: string | null;
  readonly googleMessage: string | null;

  constructor(info: GoogleApiErrorInfo = EMPTY_GOOGLE_API_ERROR) {
    super("Google account lookup failed");
    this.name = "GoogleAccountLookupError";
    this.httpStatus = info.httpStatus;
    this.googleError = info.googleError;
    this.googleReason = info.googleReason;
    this.googleStatus = info.googleStatus;
    this.googleMessage = info.googleMessage;
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
  } catch (error) {
    throw new GoogleOAuthExchangeError(networkGoogleApiError(error));
  }

  if (!response.ok) {
    throw new GoogleOAuthExchangeError(await readGoogleApiError(response));
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new GoogleOAuthExchangeError({
      ...EMPTY_GOOGLE_API_ERROR,
      httpStatus: response.status,
      googleError: "invalid_json",
    });
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

export async function revokeGoogleToken(token: string): Promise<{
  ok: boolean;
  httpStatus: number | null;
}> {
  if (token.length === 0 || token.length > 8192) {
    return { ok: false, httpStatus: null };
  }

  try {
    const response = await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });

    await response.arrayBuffer().catch(() => undefined);

    if (response.ok) {
      return { ok: true, httpStatus: response.status };
    }

    console.error("Google token revocation was not confirmed", response.status);
    return { ok: false, httpStatus: response.status };
  } catch {
    console.error("Google token revocation could not be completed");
    return { ok: false, httpStatus: null };
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
  } catch (error) {
    throw new GoogleAccountLookupError(networkGoogleApiError(error));
  }

  if (!response.ok) {
    throw new GoogleAccountLookupError(await readGoogleApiError(response));
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new GoogleAccountLookupError({
      ...EMPTY_GOOGLE_API_ERROR,
      httpStatus: response.status,
      googleError: "invalid_json",
    });
  }

  return parseGoogleAccountId(payload, response.status);
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

function parseGoogleAccountId(payload: unknown, httpStatus: number) {
  if (typeof payload !== "object" || payload === null) {
    throw new GoogleAccountLookupError({
      ...EMPTY_GOOGLE_API_ERROR,
      httpStatus,
      googleError: "invalid_account",
    });
  }

  const user = (payload as { user?: unknown }).user;

  if (typeof user !== "object" || user === null) {
    throw new GoogleAccountLookupError({
      ...EMPTY_GOOGLE_API_ERROR,
      httpStatus,
      googleError: "missing_user",
    });
  }

  const permissionId = (user as { permissionId?: unknown }).permissionId;

  if (
    typeof permissionId !== "string" ||
    permissionId.length === 0 ||
    permissionId.length > 191 ||
    /\s/.test(permissionId)
  ) {
    throw new GoogleAccountLookupError({
      ...EMPTY_GOOGLE_API_ERROR,
      httpStatus,
      googleError: "invalid_permission_id",
    });
  }

  return permissionId;
}

function networkGoogleApiError(error: unknown): GoogleApiErrorInfo {
  const cause =
    error instanceof Error && "cause" in error ? error.cause : undefined;
  const code =
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "string" &&
    /^[A-Z0-9_]+$/.test(cause.code)
      ? cause.code
      : null;

  return {
    ...EMPTY_GOOGLE_API_ERROR,
    googleError: "network",
    googleReason: code,
  };
}

const SAFE_GOOGLE_CODE = /^[A-Za-z0-9_]+$/;
const TOKEN_LIKE =
  /ya29\.|1\/\/|eyJ[A-Za-z0-9_-]{10,}|Bearer\s+\S+|access_token|refresh_token|client_secret/i;

function safeGoogleCode(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 64 ||
    !SAFE_GOOGLE_CODE.test(value)
  ) {
    return null;
  }

  return value;
}

function safeGoogleMessage(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const message = value.replace(/\s+/g, " ").trim().slice(0, 180);

  if (message.length === 0 || TOKEN_LIKE.test(message)) {
    return null;
  }

  return message;
}

async function readGoogleApiError(
  response: Response,
): Promise<GoogleApiErrorInfo> {
  const info: GoogleApiErrorInfo = {
    ...EMPTY_GOOGLE_API_ERROR,
    httpStatus: response.status,
  };

  try {
    const payload: unknown = await response.json();

    if (typeof payload !== "object" || payload === null) {
      return info;
    }

    const error = (payload as { error?: unknown }).error;

    if (typeof error === "string") {
      info.googleError = safeGoogleCode(error);
      return info;
    }

    if (typeof error !== "object" || error === null) {
      return info;
    }

    const record = error as {
      status?: unknown;
      message?: unknown;
      errors?: unknown;
    };
    const first = Array.isArray(record.errors) ? record.errors[0] : null;
    const reason =
      typeof first === "object" && first !== null
        ? safeGoogleCode((first as { reason?: unknown }).reason)
        : null;
    const status = safeGoogleCode(record.status);

    info.googleReason = reason;
    info.googleStatus = status;
    info.googleError = reason ?? status;
    info.googleMessage =
      (typeof first === "object" && first !== null
        ? safeGoogleMessage((first as { message?: unknown }).message)
        : null) ?? safeGoogleMessage(record.message);
  } catch {
    info.googleError = "invalid_json";
  }

  return info;
}
