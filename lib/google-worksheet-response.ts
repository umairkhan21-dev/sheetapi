import {
  GoogleOAuthConfigError,
  GoogleTokenRefreshError,
} from "@/lib/google";
import { GoogleNotConnectedError } from "@/lib/google-access";
import {
  GoogleSheetsError,
  WorksheetNotFoundError,
} from "@/lib/google-worksheets";

export function worksheetErrorResponse(error: unknown) {
  if (error instanceof GoogleNotConnectedError) {
    return errorResponse(
      "GOOGLE_NOT_CONNECTED",
      "Connect Google Sheets before opening a spreadsheet.",
      404,
    );
  }

  if (error instanceof GoogleOAuthConfigError) {
    console.error("Google worksheet request is not configured");
    return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
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
      "Google Sheets is temporarily unavailable. Try again.",
      502,
    );
  }

  if (error instanceof WorksheetNotFoundError) {
    return errorResponse(
      "WORKSHEET_NOT_FOUND",
      "That worksheet was not found.",
      404,
    );
  }

  if (error instanceof GoogleSheetsError) {
    console.error("Google Sheets request failed", error.httpStatus, error.kind);

    if (error.kind === "reauth") {
      return errorResponse(
        "GOOGLE_REAUTH_REQUIRED",
        "Google Sheets access is no longer valid. Reconnect Google Sheets.",
        403,
      );
    }

    if (error.kind === "not_found") {
      return errorResponse(
        "SPREADSHEET_NOT_FOUND",
        "SheetAPI can no longer access this spreadsheet. Choose it again.",
        404,
      );
    }

    if (error.kind === "invalid") {
      return errorResponse(
        "INVALID_INPUT",
        "That spreadsheet could not be read.",
        400,
      );
    }

    if (error.kind === "not_configured") {
      return errorResponse(
        "GOOGLE_UNAVAILABLE",
        "The Google Sheets API is not enabled for this app.",
        502,
      );
    }

    return errorResponse(
      "GOOGLE_UNAVAILABLE",
      "Google Sheets is temporarily unavailable. Try again.",
      502,
    );
  }

  console.error(
    "Spreadsheet worksheet request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
}

function errorResponse(
  code:
    | "GOOGLE_NOT_CONNECTED"
    | "GOOGLE_REAUTH_REQUIRED"
    | "GOOGLE_UNAVAILABLE"
    | "WORKSHEET_NOT_FOUND"
    | "SPREADSHEET_NOT_FOUND"
    | "INVALID_INPUT"
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
