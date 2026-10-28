import { getCurrentUser } from "@/lib/auth";
import {
  GoogleOAuthConfigError,
  GoogleTokenRefreshError,
} from "@/lib/google";
import {
  createGoogleAccessTokenResolver,
  needsLegacyReseal,
} from "@/lib/google-access";
import {
  getGoogleSpreadsheet,
  GoogleDriveError,
  isGoogleFileId,
  SpreadsheetTypeError,
} from "@/lib/google-sheets";
import { prisma } from "@/lib/prisma";
import { syncSelectedSpreadsheetNames } from "@/lib/selected-spreadsheet-sync";
import { openSecret, openSecretIfPresent } from "@/lib/token-crypto";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 4096;

function errorResponse(
  code:
    | "UNAUTHORIZED"
    | "INVALID_INPUT"
    | "GOOGLE_NOT_CONNECTED"
    | "GOOGLE_REAUTH_REQUIRED"
    | "GOOGLE_UNAVAILABLE"
    | "SPREADSHEET_NOT_FOUND"
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

function spreadsheetResponse(spreadsheet: {
  spreadsheetId: string;
  name: string;
  modifiedTime: Date | null;
}) {
  return {
    id: spreadsheet.spreadsheetId,
    name: spreadsheet.name,
    modifiedTime: spreadsheet.modifiedTime?.toISOString() ?? null,
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const selections = await syncSelectedSpreadsheetNames(user.id);

    return Response.json(
      {
        success: true,
        spreadsheets: selections.map(spreadsheetResponse),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "Selected spreadsheets could not be loaded",
      error instanceof Error ? error.name : "UnknownError",
    );
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const spreadsheetId = await readSpreadsheetId(request);

    if (!spreadsheetId) {
      return errorResponse(
        "INVALID_INPUT",
        "Choose a Google spreadsheet.",
        400,
      );
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
        "Connect Google Sheets before choosing a spreadsheet.",
        404,
      );
    }

    const refreshTokenPlain = openSecretIfPresent(connection.refreshToken);
    const accessTokens = createGoogleAccessTokenResolver({
      userId: user.id,
      accessToken: openSecret(connection.accessToken),
      refreshToken: refreshTokenPlain,
      expiresAt: connection.expiresAt,
      resealLegacy: needsLegacyReseal(
        connection.accessToken,
        connection.refreshToken,
      ),
    });
    let accessToken = await accessTokens.resolve();
    let spreadsheet;

    try {
      spreadsheet = await getGoogleSpreadsheet(accessToken, spreadsheetId);
    } catch (error) {
      if (
        error instanceof GoogleDriveError &&
        error.httpStatus === 401 &&
        !accessTokens.didRefresh &&
        refreshTokenPlain
      ) {
        accessToken = await accessTokens.resolve(true);
        spreadsheet = await getGoogleSpreadsheet(accessToken, spreadsheetId);
      } else {
        throw error;
      }
    }

    const saved = await prisma.selectedSpreadsheet.upsert({
      where: {
        userId_spreadsheetId: {
          userId: user.id,
          spreadsheetId: spreadsheet.id,
        },
      },
      create: {
        userId: user.id,
        spreadsheetId: spreadsheet.id,
        name: spreadsheet.name,
        modifiedTime: toModifiedTime(spreadsheet.modifiedTime),
      },
      update: {
        name: spreadsheet.name,
        modifiedTime: toModifiedTime(spreadsheet.modifiedTime),
      },
      select: {
        spreadsheetId: true,
        name: true,
        modifiedTime: true,
      },
    });

    return Response.json(
      {
        success: true,
        spreadsheet: spreadsheetResponse(saved),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return selectionErrorResponse(error);
  }
}

async function readSpreadsheetId(request: Request) {
  const body = await request.text();

  if (body.length === 0 || body.length > MAX_BODY_LENGTH) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(body);

    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return null;
    }

    const spreadsheetId = (payload as { spreadsheetId?: unknown }).spreadsheetId;

    if (!isGoogleFileId(spreadsheetId)) {
      return null;
    }

    return spreadsheetId;
  } catch {
    return null;
  }
}

function toModifiedTime(value: string | null) {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);

  if (!Number.isFinite(time)) {
    return null;
  }

  return new Date(time);
}

function selectionErrorResponse(error: unknown) {
  if (error instanceof GoogleOAuthConfigError) {
    console.error("Google OAuth is not configured");
    return errorResponse(
      "GOOGLE_REAUTH_REQUIRED",
      "Google Sheets access is no longer valid. Reconnect Google Sheets.",
      403,
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
      "GOOGLE_UNAVAILABLE",
      "Google Drive is temporarily unavailable. Try again.",
      502,
    );
  }

  if (error instanceof SpreadsheetTypeError) {
    return errorResponse(
      "INVALID_INPUT",
      "Choose a Google spreadsheet.",
      400,
    );
  }

  if (error instanceof GoogleDriveError) {
    console.error("Google spreadsheet validation failed", error.httpStatus);

    if (error.reauthRequired) {
      return errorResponse(
        "GOOGLE_REAUTH_REQUIRED",
        "Google Sheets access is no longer valid. Reconnect Google Sheets.",
        403,
      );
    }

    if (error.httpStatus === 404 || error.httpStatus === 403) {
      return errorResponse(
        "SPREADSHEET_NOT_FOUND",
        "SheetAPI cannot access that spreadsheet. Choose it again.",
        404,
      );
    }

    return errorResponse(
      "GOOGLE_UNAVAILABLE",
      "Google Drive is temporarily unavailable. Try again.",
      502,
    );
  }

  console.error(
    "Spreadsheet selection could not be saved",
    error instanceof Error ? error.name : "UnknownError",
  );
  return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
}
