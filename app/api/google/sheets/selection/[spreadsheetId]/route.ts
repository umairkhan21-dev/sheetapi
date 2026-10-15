import { getCurrentUser } from "@/lib/auth";
import { managementError, managementJson } from "@/lib/api-management-response";
import { disconnectOwnedSpreadsheet } from "@/lib/google-connection";
import { isGoogleFileId } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ spreadsheetId: string }> },
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return managementError("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const { spreadsheetId } = await params;

    if (!isGoogleFileId(spreadsheetId)) {
      return managementError(
        "INVALID_INPUT",
        "Choose a saved spreadsheet.",
        400,
      );
    }

    const disconnected = await disconnectOwnedSpreadsheet(user.id, spreadsheetId);

    if (!disconnected.ok) {
      return managementError(
        "NOT_FOUND",
        "That saved spreadsheet was not found.",
        404,
      );
    }

    return managementJson({
      success: true,
      spreadsheet: {
        id: disconnected.spreadsheetId,
        name: disconnected.name,
      },
      affectedApis: disconnected.affectedApis,
    });
  } catch (error) {
    console.error(
      "Spreadsheet disconnect failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return managementError(
      "INTERNAL_ERROR",
      "The spreadsheet could not be disconnected. Try again.",
      500,
    );
  }
}
