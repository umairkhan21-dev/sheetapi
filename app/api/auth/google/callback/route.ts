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
    logOAuthCallbackError(error);
    return redirectToDashboard(request, "error", "failed");
  }
}

const TOKEN_LIKE =
  /ya29\.|1\/\/|eyJ[A-Za-z0-9_-]{10,}|Bearer\s+\S+|access_token|refresh_token|client_secret/i;

function logOAuthCallbackError(error: unknown) {
  const stage = callbackFailureStage(error);
  const name = error instanceof Error ? error.name : "UnknownError";
  const rawMessage =
    error instanceof Error ? error.message : "Google OAuth callback failed";
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const prismaCode =
    name.startsWith("Prisma") && typeof record?.code === "string"
      ? record.code
      : undefined;

  console.error("Google OAuth callback failed", {
    stage,
    name,
    message:
      name.startsWith("Prisma") || TOKEN_LIKE.test(rawMessage)
        ? name
        : rawMessage.slice(0, 180),
    httpStatus:
      typeof record?.httpStatus === "number" ? record.httpStatus : undefined,
    googleError:
      typeof record?.googleError === "string" ? record.googleError : undefined,
    googleReason:
      typeof record?.googleReason === "string"
        ? record.googleReason
        : undefined,
    googleStatus:
      typeof record?.googleStatus === "string"
        ? record.googleStatus
        : undefined,
    googleMessage:
      typeof record?.googleMessage === "string" &&
      !TOKEN_LIKE.test(record.googleMessage)
        ? record.googleMessage
        : undefined,
    prismaCode,
  });
}

function callbackFailureStage(error: unknown) {
  if (error instanceof GoogleOAuthConfigError) {
    return "config";
  }

  if (error instanceof GoogleOAuthExchangeError) {
    return "token-exchange";
  }

  if (error instanceof GoogleAccountLookupError) {
    return "account-lookup";
  }

  return "save-connection";
}
