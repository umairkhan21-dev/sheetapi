import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  GoogleOAuthConfigError,
  GOOGLE_OAUTH_STATE_COOKIE,
  googleOAuthStateCookieOptions,
} from "@/lib/google";

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
