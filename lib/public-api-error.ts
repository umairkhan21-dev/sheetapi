import { GOOGLE_RECONNECT_REQUIRED_MESSAGE } from "@/lib/google-disconnect-copy";
import {
  GoogleOAuthConfigError,
  GoogleTokenRefreshError,
} from "@/lib/google";
import { GoogleNotConnectedError } from "@/lib/google-access";
import {
  API_COLUMN_LIMIT,
  API_DATA_ROW_LIMIT,
  GoogleSheetsError,
  WorksheetNotFoundError,
  WorksheetTooLargeError,
} from "@/lib/google-worksheets";

const PUBLIC_HEADERS = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
};

export function publicApiErrorResponse(error: unknown) {
  if (error instanceof GoogleNotConnectedError) {
    console.error("Public API Google connection is unavailable");
    return publicError(
      "GOOGLE_NOT_CONNECTED",
      GOOGLE_RECONNECT_REQUIRED_MESSAGE,
      503,
    );
  }

  if (error instanceof GoogleOAuthConfigError) {
    console.error("Public API Google connection is unavailable");
    return publicError(
      "GOOGLE_NOT_CONNECTED",
      "This API is temporarily unavailable.",
      503,
    );
  }

  if (error instanceof GoogleTokenRefreshError) {
    console.error(
      error.reauthRequired
        ? "Public API Google token refresh requires reconnect"
        : "Public API Google token refresh failed",
    );
    return publicError(
      error.reauthRequired ? "GOOGLE_REAUTH_REQUIRED" : "GOOGLE_UNAVAILABLE",
      "This API is temporarily unavailable.",
      503,
    );
  }

  if (error instanceof WorksheetNotFoundError) {
    return publicError(
      "WORKSHEET_NOT_FOUND",
      "This API's worksheet is unavailable.",
      404,
    );
  }

  if (error instanceof WorksheetTooLargeError) {
    return publicError(
      "WORKSHEET_TOO_LARGE",
      `This worksheet exceeds the ${API_DATA_ROW_LIMIT} row or ${API_COLUMN_LIMIT} column limit.`,
      413,
    );
  }

  if (error instanceof GoogleSheetsError) {
    console.error(
      "Public API Google Sheets request failed",
      error.httpStatus,
      error.kind,
    );

    if (error.kind === "reauth") {
      return publicError(
        "GOOGLE_REAUTH_REQUIRED",
        "This API is temporarily unavailable.",
        503,
      );
    }

    if (error.kind === "not_found") {
      return publicError(
        "SPREADSHEET_NOT_FOUND",
        "This API's spreadsheet is unavailable.",
        404,
      );
    }

    if (error.kind === "invalid") {
      return publicError(
        "INVALID_INPUT",
        "This API's spreadsheet could not be read.",
        400,
      );
    }

    return publicError(
      "GOOGLE_UNAVAILABLE",
      "This API is temporarily unavailable.",
      503,
    );
  }

  console.error(
    "Public API request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return publicError("INTERNAL_ERROR", "Something went wrong.", 500);
}

export function publicError(
  code:
    | "NOT_FOUND"
    | "INVALID_API_KEY"
    | "API_DISABLED"
    | "GOOGLE_NOT_CONNECTED"
    | "GOOGLE_REAUTH_REQUIRED"
    | "GOOGLE_UNAVAILABLE"
    | "SPREADSHEET_NOT_FOUND"
    | "WORKSHEET_NOT_FOUND"
    | "WORKSHEET_TOO_LARGE"
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
      headers: PUBLIC_HEADERS,
    },
  );
}

export function publicJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
