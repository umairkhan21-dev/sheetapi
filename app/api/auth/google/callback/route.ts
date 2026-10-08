import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  exchangeGoogleAuthorizationCode,
  fetchGoogleAccountId,
  GoogleAccountLookupError,
  GoogleOAuthConfigError,
  GoogleOAuthExchangeError,
  GOOGLE_OAUTH_STATE_COOKIE,
  googleOAuthStateCookieOptions,
  oauthStatesMatch,
} from "@/lib/google";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_OAUTH_PARAM_LENGTH = 2048;

function readSingleParam(url: URL, name: string) {
  const values = url.searchParams.getAll(name);

  if (values.length !== 1) {
    return null;
  }

  const value = values[0];

  if (!value || value.length > MAX_OAUTH_PARAM_LENGTH) {
    return null;
  }

  return value;
}

function redirectToDashboard(
  request: NextRequest,
  google: "connected" | "error",
  reason?: "unauthorized" | "denied" | "invalid" | "failed",
) {
  const url = new URL("/dashboard", request.url);
  url.searchParams.set("google", google);

  if (reason) {
    url.searchParams.set("reason", reason);
  }

  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(
    GOOGLE_OAUTH_STATE_COOKIE,
    "",
    googleOAuthStateCookieOptions(0),
  );

  return response;
}

export async function GET(request: NextRequest) {
  const returnedState = readSingleParam(request.nextUrl, "state");
  const storedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const stateIsValid =
    typeof storedState === "string" &&
    storedState.length > 0 &&
    storedState.length <= 128 &&
    returnedState !== null &&
    oauthStatesMatch(storedState, returnedState);

  if (!stateIsValid) {
    return redirectToDashboard(request, "error", "invalid");
  }

  const oauthError = readSingleParam(request.nextUrl, "error");

  if (oauthError) {
    return redirectToDashboard(
      request,
      "error",
      oauthError === "access_denied" ? "denied" : "failed",
    );
  }

  const code = readSingleParam(request.nextUrl, "code");

  if (!code) {
    return redirectToDashboard(request, "error", "invalid");
  }

  try {
    const user = await getCurrentUser();

    if (!user) {
      return redirectToDashboard(request, "error", "unauthorized");
    }

    const tokens = await exchangeGoogleAuthorizationCode(code);
    const googleAccountId = await fetchGoogleAccountId(tokens.accessToken);
    const existing = await prisma.googleConnection.findUnique({
      where: { userId: user.id },
      select: { refreshToken: true },
    });
    const refreshToken = tokens.refreshToken ?? existing?.refreshToken ?? null;

    await prisma.googleConnection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        googleAccountId,
        accessToken: tokens.accessToken,
        refreshToken,
        expiresAt: tokens.expiresAt,
      },
      update: {
        googleAccountId,
        accessToken: tokens.accessToken,
        refreshToken,
        expiresAt: tokens.expiresAt,
      },
    });

    return redirectToDashboard(request, "connected");
  } catch (error) {
    if (error instanceof GoogleOAuthConfigError) {
      console.error("Google OAuth is not configured");
    } else if (error instanceof GoogleOAuthExchangeError) {
      console.error("Google token exchange failed");
    } else if (error instanceof GoogleAccountLookupError) {
      console.error("Google account lookup failed");
    } else {
      console.error("Google connection could not be saved");
    }

    return redirectToDashboard(request, "error", "failed");
  }
}
