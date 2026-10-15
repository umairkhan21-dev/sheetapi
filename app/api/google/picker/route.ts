import { getCurrentUser } from "@/lib/auth";
import {
  GoogleOAuthConfigError,
  GoogleTokenRefreshError,
} from "@/lib/google";
import { createGoogleAccessTokenResolver } from "@/lib/google-access";
import {
  getGooglePickerConfig,
  GooglePickerConfigError,
} from "@/lib/google-picker";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function errorResponse(
  code:
    | "UNAUTHORIZED"
    | "GOOGLE_NOT_CONNECTED"
    | "GOOGLE_REAUTH_REQUIRED"
    | "PICKER_NOT_CONFIGURED"
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

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const picker = getGooglePickerConfig();
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
        "Connect Google Sheets before choosing a spreadsheet.",
        404,
      );
    }

    const accessToken = await createGoogleAccessTokenResolver({
      userId: user.id,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      expiresAt: connection.expiresAt,
    }).resolve();

    return Response.json(
      {
        success: true,
        picker: {
          developerKey: picker.developerKey,
          appId: picker.appId,
          accessToken,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof GooglePickerConfigError) {
      console.error("Google Picker is not configured");
      return errorResponse(
        "PICKER_NOT_CONFIGURED",
        "Google Picker is not configured.",
        503,
      );
    }

    if (error instanceof GoogleOAuthConfigError) {
      console.error("Google OAuth is not configured");
      return errorResponse(
        "PICKER_NOT_CONFIGURED",
        "Google Picker is not configured.",
        503,
      );
    }

    if (error instanceof GoogleTokenRefreshError) {
      console.error(
        error.reauthRequired
          ? "Google token refresh requires reconnect"
          : "Google token refresh failed",
      );

      if (error.reauthRequired) {
        return errorResponse(
          "GOOGLE_REAUTH_REQUIRED",
          "Google Sheets access is no longer valid. Reconnect Google Sheets.",
          403,
        );
      }

      return errorResponse(
        "INTERNAL_ERROR",
        "Google Sheets could not be opened. Try again.",
        502,
      );
    }

    console.error(
      "Google Picker session failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}
