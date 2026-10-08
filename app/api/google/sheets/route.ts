import { getCurrentUser } from "@/lib/auth";
import {
  GoogleOAuthConfigError,
  GoogleTokenRefreshError,
} from "@/lib/google";
import { createGoogleAccessTokenResolver } from "@/lib/google-access";
import { GoogleDriveError, listGoogleSpreadsheets } from "@/lib/google-sheets";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function errorResponse(
  code:
    | "UNAUTHORIZED"
    | "GOOGLE_NOT_CONNECTED"
    | "GOOGLE_REAUTH_REQUIRED"
    | "GOOGLE_UNAVAILABLE"
    | "INTERNAL_ERROR",
  message: string,
  status: number,
) {
  return Response.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function logSafeFailure(error: unknown) {
  if (error instanceof GoogleOAuthConfigError) {
    console.error("Google OAuth is not configured");
    return;
  }

  if (error instanceof GoogleTokenRefreshError) {
    console.error(
      error.reauthRequired
        ? "Google token refresh requires reconnect"
        : "Google token refresh failed",
    );
    return;
  }

  if (error instanceof GoogleDriveError) {
    console.error("Google Drive spreadsheet list failed", error.httpStatus);
    return;
  }

  console.error("Spreadsheet list failed");
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const connection = await prisma.googleConnection.findUnique({
      where: { userId: user.id },
      select: {
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
      },
    });

    if (!connection) {
      return errorResponse(
        "GOOGLE_NOT_CONNECTED",
        "Connect Google Sheets before listing spreadsheets.",
        404,
      );
    }

    const accessTokens = createGoogleAccessTokenResolver({
      userId: user.id,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      expiresAt: connection.expiresAt,
    });
    let accessToken = await accessTokens.resolve();
    let spreadsheets;

    try {
      spreadsheets = await listGoogleSpreadsheets(accessToken);
    } catch (error) {
      if (
        error instanceof GoogleDriveError &&
        error.httpStatus === 401 &&
        !accessTokens.didRefresh &&
        connection.refreshToken
      ) {
        accessToken = await accessTokens.resolve(true);
        spreadsheets = await listGoogleSpreadsheets(accessToken);
      } else {
        throw error;
      }
    }

    return Response.json(
      {
        success: true,
        spreadsheets,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    logSafeFailure(error);

    if (error instanceof GoogleTokenRefreshError && error.reauthRequired) {
      return errorResponse(
        "GOOGLE_REAUTH_REQUIRED",
        "Google Sheets access is no longer valid. Reconnect Google Sheets.",
        403,
      );
    }

    if (error instanceof GoogleDriveError && error.reauthRequired) {
      return errorResponse(
        "GOOGLE_REAUTH_REQUIRED",
        "Google Sheets access is no longer valid. Reconnect Google Sheets.",
        403,
      );
    }

    if (
      error instanceof GoogleTokenRefreshError ||
      error instanceof GoogleDriveError
    ) {
      return errorResponse(
        "GOOGLE_UNAVAILABLE",
        "Google Drive is temporarily unavailable. Try again.",
        502,
      );
    }

    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}
