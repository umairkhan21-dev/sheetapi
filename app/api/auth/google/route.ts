import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { managementError, managementJson } from "@/lib/api-management-response";
import {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  GoogleOAuthConfigError,
  GOOGLE_OAUTH_STATE_COOKIE,
  googleOAuthStateCookieOptions,
} from "@/lib/google";
import { disconnectOwnedGoogleAccount } from "@/lib/google-connection";

export const runtime = "nodejs";

function redirectToDashboard(
  request: NextRequest,
  reason: "unauthorized" | "failed",
) {
  const url = new URL("/dashboard", request.url);
  url.searchParams.set("google", "error");
  url.searchParams.set("reason", reason);

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
  try {
    const user = await getCurrentUser();

    if (!user) {
      return redirectToDashboard(request, "unauthorized");
    }

    const state = createOAuthState();
    const authorizationUrl = buildGoogleAuthorizationUrl(state);
    const response = NextResponse.redirect(authorizationUrl, 302);

    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(
      GOOGLE_OAUTH_STATE_COOKIE,
      state,
      googleOAuthStateCookieOptions(),
    );

    return response;
  } catch (error) {
    if (error instanceof GoogleOAuthConfigError) {
      console.error("Google OAuth is not configured");
    } else {
      console.error("Google OAuth start failed");
    }

    return redirectToDashboard(request, "failed");
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return managementError("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const disconnected = await disconnectOwnedGoogleAccount(user.id);

    if (!disconnected.ok) {
      return managementJson(
        {
          success: false,
          error: {
            code: "GOOGLE_NOT_CONNECTED",
            message: "Google Sheets is not connected.",
          },
        },
        404,
      );
    }

    return managementJson({
      success: true,
      revoked: disconnected.revoked,
      affectedApis: disconnected.affectedApis,
      message: disconnected.message,
    });
  } catch (error) {
    console.error(
      "Google disconnect failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return managementError(
      "INTERNAL_ERROR",
      "Google Sheets could not be disconnected. Try again.",
      500,
    );
  }
}
