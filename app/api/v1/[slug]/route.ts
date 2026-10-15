import { isApiSlug } from "@/lib/api-config";
import { SPREADSHEET_SELECTION_DISCONNECTED_MESSAGE } from "@/lib/google-disconnect-copy";
import { authenticateApiKey, markApiKeyUsed } from "@/lib/api-key-store";
import { withGoogleAccessToken } from "@/lib/google-access";
import { readWorksheetRecords } from "@/lib/google-worksheets";
import { prisma } from "@/lib/prisma";
import {
  publicApiErrorResponse,
  publicError,
  publicJson,
} from "@/lib/public-api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    if (!isApiSlug(slug)) {
      return publicError("NOT_FOUND", "This API was not found.", 404);
    }

    const api = await prisma.api.findUnique({
      where: { slug },
      select: {
        id: true,
        userId: true,
        spreadsheetId: true,
        worksheetId: true,
        status: true,
      },
    });

    if (!api) {
      return publicError("NOT_FOUND", "This API was not found.", 404);
    }

    const key = await authenticateApiKey(
      api.id,
      request.headers.get("authorization"),
    );

    if (!key.ok) {
      return publicError(
        "INVALID_API_KEY",
        key.reason === "missing"
          ? "A valid API key is required."
          : "The API key is invalid or revoked.",
        401,
      );
    }

    if (api.status !== "ACTIVE") {
      return publicError("API_DISABLED", "This API is disabled.", 403);
    }

    const saved = await prisma.selectedSpreadsheet.findUnique({
      where: {
        userId_spreadsheetId: {
          userId: api.userId,
          spreadsheetId: api.spreadsheetId,
        },
      },
      select: { spreadsheetId: true },
    });

    if (!saved) {
      return publicError(
        "SPREADSHEET_NOT_FOUND",
        SPREADSHEET_SELECTION_DISCONNECTED_MESSAGE,
        404,
      );
    }

    const keyStillActive = await markApiKeyUsed(key.keyId, api.id);

    if (!keyStillActive) {
      return publicError(
        "INVALID_API_KEY",
        "The API key is invalid or revoked.",
        401,
      );
    }

    const records = await withGoogleAccessToken(api.userId, (accessToken) =>
      readWorksheetRecords(accessToken, saved.spreadsheetId, api.worksheetId),
    );

    return publicJson(records.rows);
  } catch (error) {
    return publicApiErrorResponse(error);
  }
}
