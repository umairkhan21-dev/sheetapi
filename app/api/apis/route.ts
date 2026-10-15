import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { managementError, managementJson } from "@/lib/api-management-response";
import { buildPublicApiUrl, normalizeApiName, normalizeApiSlug } from "@/lib/api-config";
import { getAppUrl } from "@/lib/email";
import { withGoogleAccessToken } from "@/lib/google-access";
import { isGoogleFileId } from "@/lib/google-sheets";
import { worksheetErrorResponse } from "@/lib/google-worksheet-response";
import { readSheetId, readSpreadsheetWorksheets } from "@/lib/google-worksheets";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 8_192;

function errorResponse(
  code:
    | "UNAUTHORIZED"
    | "INVALID_INPUT"
    | "SPREADSHEET_NOT_FOUND"
    | "WORKSHEET_NOT_FOUND"
    | "SLUG_TAKEN",
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
      return managementError("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const apis = await prisma.api.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        worksheetName: true,
        status: true,
        createdAt: true,
      },
    });

    return managementJson({
      success: true,
      apis: apis.map((api) => ({
        id: api.id,
        name: api.name,
        slug: api.slug,
        worksheetName: api.worksheetName,
        status: api.status,
        url: buildPublicApiUrl(getAppUrl(), api.slug),
        createdAt: api.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error(
      "API list failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return managementError("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const input = await readCreateInput(request);

    if (!input.ok) {
      return errorResponse("INVALID_INPUT", input.message, 400);
    }

    const saved = await prisma.selectedSpreadsheet.findUnique({
      where: {
        userId_spreadsheetId: {
          userId: user.id,
          spreadsheetId: input.spreadsheetId,
        },
      },
      select: {
        spreadsheetId: true,
      },
    });

    if (!saved) {
      return errorResponse(
        "SPREADSHEET_NOT_FOUND",
        "Choose this spreadsheet before creating an API.",
        404,
      );
    }

    const existingSlug = await prisma.api.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });

    if (existingSlug) {
      return errorResponse(
        "SLUG_TAKEN",
        "That endpoint slug is already in use. Choose another.",
        409,
      );
    }

    const spreadsheet = await withGoogleAccessToken(user.id, (accessToken) =>
      readSpreadsheetWorksheets(accessToken, saved.spreadsheetId),
    );
    const worksheet = spreadsheet.sheets.find(
      (sheet) => sheet.id === input.worksheetId,
    );

    if (!worksheet) {
      return errorResponse(
        "WORKSHEET_NOT_FOUND",
        "That worksheet was not found.",
        404,
      );
    }

    const created = await prisma.api.create({
      data: {
        userId: user.id,
        name: input.name,
        slug: input.slug,
        spreadsheetId: saved.spreadsheetId,
        worksheetId: worksheet.id,
        worksheetName: worksheet.title,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        slug: true,
        spreadsheetId: true,
        worksheetId: true,
        worksheetName: true,
        status: true,
        createdAt: true,
      },
    });

    return Response.json(
      {
        success: true,
        api: {
          id: created.id,
          name: created.name,
          slug: created.slug,
          spreadsheetId: created.spreadsheetId,
          spreadsheetName: spreadsheet.name,
          worksheetId: created.worksheetId,
          worksheetName: created.worksheetName,
          status: created.status,
          url: buildPublicApiUrl(getAppUrl(), created.slug),
          createdAt: created.createdAt.toISOString(),
        },
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return errorResponse(
        "SLUG_TAKEN",
        "That endpoint slug is already in use. Choose another.",
        409,
      );
    }

    return worksheetErrorResponse(error);
  }
}

async function readCreateInput(request: Request) {
  const body = await request.text();

  if (body.length === 0 || body.length > MAX_BODY_LENGTH) {
    return { ok: false as const, message: "Enter an API name, spreadsheet, and worksheet." };
  }

  try {
    const payload: unknown = JSON.parse(body);

    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return {
        ok: false as const,
        message: "Enter an API name, spreadsheet, and worksheet.",
      };
    }

    const record = payload as {
      name?: unknown;
      slug?: unknown;
      spreadsheetId?: unknown;
      worksheetId?: unknown;
    };

    if (typeof record.name !== "string" || !isGoogleFileId(record.spreadsheetId)) {
      return {
        ok: false as const,
        message: "Enter an API name and choose a saved spreadsheet.",
      };
    }

    const name = normalizeApiName(record.name);

    if (!name) {
      return {
        ok: false as const,
        message: "Enter an API name up to 80 characters.",
      };
    }

    const worksheetId = readWorksheetId(record.worksheetId);

    if (worksheetId == null) {
      return {
        ok: false as const,
        message: "Choose a worksheet.",
      };
    }

    const slug = readSlug(record.slug, name);

    if (!slug) {
      return {
        ok: false as const,
        message: "Enter a URL-friendly endpoint slug using letters, numbers, and hyphens.",
      };
    }

    return {
      ok: true as const,
      name,
      slug,
      spreadsheetId: record.spreadsheetId,
      worksheetId,
    };
  } catch {
    return {
      ok: false as const,
      message: "Enter an API name, spreadsheet, and worksheet.",
    };
  }
}

function readSlug(value: unknown, name: string) {
  if (value == null) {
    return normalizeApiSlug(name);
  }

  if (typeof value !== "string") {
    return null;
  }

  if (value.trim() === "") {
    return normalizeApiSlug(name);
  }

  return normalizeApiSlug(value);
}

function readWorksheetId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return readSheetId(String(value));
  }

  if (typeof value === "string") {
    return readSheetId(value);
  }

  return null;
}
