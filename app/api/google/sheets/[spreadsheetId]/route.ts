import { getCurrentUser } from "@/lib/auth";
import { withGoogleAccessToken } from "@/lib/google-access";
import { isGoogleFileId } from "@/lib/google-sheets";
import { worksheetErrorResponse } from "@/lib/google-worksheet-response";
import { readSpreadsheetWorksheets } from "@/lib/google-worksheets";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function errorResponse(
  code: "UNAUTHORIZED" | "INVALID_INPUT" | "SPREADSHEET_NOT_FOUND",
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ spreadsheetId: string }> },
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const { spreadsheetId } = await params;

    if (!isGoogleFileId(spreadsheetId)) {
      return errorResponse(
        "INVALID_INPUT",
        "That spreadsheet ID is not valid.",
        400,
      );
    }

    const saved = await prisma.selectedSpreadsheet.findUnique({
      where: {
        userId_spreadsheetId: {
          userId: user.id,
          spreadsheetId,
        },
      },
      select: { spreadsheetId: true },
    });

    if (!saved) {
      return errorResponse(
        "SPREADSHEET_NOT_FOUND",
        "Choose this spreadsheet before opening it.",
        404,
      );
    }

    const spreadsheet = await withGoogleAccessToken(user.id, (accessToken) =>
      readSpreadsheetWorksheets(accessToken, spreadsheetId),
    );

    return Response.json(
      {
        success: true,
        id: spreadsheet.id,
        name: spreadsheet.name,
        sheets: spreadsheet.sheets,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return worksheetErrorResponse(error);
  }
}
