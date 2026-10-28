import { isApiSlug } from "@/lib/api-config";
import { SPREADSHEET_SELECTION_DISCONNECTED_MESSAGE } from "@/lib/google-disconnect-copy";
import { authenticateApiKey, markApiKeyUsed } from "@/lib/api-key-store";
import { withGoogleAccessToken } from "@/lib/google-access";
import {
  appendWorksheetRow,
  deleteWorksheetRow,
  readWorksheetRecords,
  updateWorksheetRow,
} from "@/lib/google-worksheets";
import { prisma } from "@/lib/prisma";
import {
  filterWorksheetRows,
  publicApiUnknownFilterMessage,
  readPublicFilters,
  unknownPublicFilterColumn,
} from "@/lib/public-api-filter";
import {
  pageWorksheetRows,
  readPublicPagination,
} from "@/lib/public-api-pagination";
import { publicCorsPreflightResponse } from "@/lib/public-api-cors";
import {
  publicApiErrorResponse,
  publicError,
  publicJson,
  publicRateLimitedResponse,
} from "@/lib/public-api-error";
import {
  deleteDimensionIndexes,
  isPublicRowInRange,
  mergePatchedRow,
  parsePublicJsonObject,
  publicRowOutOfRangeMessage,
  readPublicJsonContentType,
  readPublicRowNumber,
  validatePublicRowBody,
} from "@/lib/public-api-write";
import {
  PUBLIC_API_RATE_LIMIT,
  clientIpFromRequest,
  consumeRateLimit,
  rateLimitIdentityFromAuthorization,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WRITE_BODY_BYTES = 1_000_000;

type PublicApiContext = {
  api: {
    id: number;
    userId: number;
    spreadsheetId: string;
    worksheetId: number;
  };
  keyId: number;
  spreadsheetId: string;
};

async function enforcePublicApiRateLimit(request: Request) {
  const authorization = request.headers.get("authorization");
  const identity =
    rateLimitIdentityFromAuthorization(authorization) ??
    clientIpFromRequest(request);
  const limited = await consumeRateLimit({
    key: `public:${identity}`,
    limit: PUBLIC_API_RATE_LIMIT.limit,
    windowSeconds: PUBLIC_API_RATE_LIMIT.windowSeconds,
  });

  if (!limited.ok) {
    return publicRateLimitedResponse(limited.retryAfterSeconds);
  }

  return null;
}

async function authorizePublicApi(
  request: Request,
  slug: string,
): Promise<PublicApiContext | Response> {
  const rateLimited = await enforcePublicApiRateLimit(request);

  if (rateLimited) {
    return rateLimited;
  }

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

  return {
    api: {
      id: api.id,
      userId: api.userId,
      spreadsheetId: api.spreadsheetId,
      worksheetId: api.worksheetId,
    },
    keyId: key.keyId,
    spreadsheetId: saved.spreadsheetId,
  };
}

async function markAuthorizedKeyUsed(context: PublicApiContext) {
  const keyStillActive = await markApiKeyUsed(context.keyId, context.api.id);

  if (!keyStillActive) {
    return publicError(
      "INVALID_API_KEY",
      "The API key is invalid or revoked.",
      401,
    );
  }

  return null;
}

async function readWriteBody(request: Request) {
  const contentType = readPublicJsonContentType(
    request.headers.get("content-type"),
  );

  if (!contentType.ok) {
    return publicError("INVALID_INPUT", contentType.message, 400);
  }

  const contentLength = request.headers.get("content-length");

  if (contentLength != null && /^\d+$/.test(contentLength)) {
    const length = Number(contentLength);

    if (Number.isSafeInteger(length) && length > MAX_WRITE_BODY_BYTES) {
      return publicError(
        "INVALID_INPUT",
        "The request body is too large.",
        400,
      );
    }
  }

  let text: string;

  try {
    text = await request.text();
  } catch {
    return publicError(
      "INVALID_INPUT",
      "The request body could not be read.",
      400,
    );
  }

  if (text.length > MAX_WRITE_BODY_BYTES) {
    return publicError("INVALID_INPUT", "The request body is too large.", 400);
  }

  const parsed = parsePublicJsonObject(text);

  if (!parsed.ok) {
    return publicError("INVALID_INPUT", parsed.message, 400);
  }

  return parsed.body;
}

export async function OPTIONS() {
  return publicCorsPreflightResponse();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const authorized = await authorizePublicApi(request, slug);

    if (authorized instanceof Response) {
      return authorized;
    }

    const searchParams = new URL(request.url).searchParams;
    const page = readPublicPagination(searchParams);

    if (!page.ok) {
      return publicError("INVALID_INPUT", page.message, 400);
    }

    const filters = readPublicFilters(searchParams);

    if (!filters.ok) {
      return publicError("INVALID_INPUT", filters.message, 400);
    }

    const used = await markAuthorizedKeyUsed(authorized);

    if (used) {
      return used;
    }

    // The Google read stays on the existing bounded worksheet range. Sheets
    // omits empty rows that are trailing inside a requested range, so reading
    // only the filtered page would skip blank data rows that the full array
    // includes. Filters and pagination both run on that mapped array.
    const records = await withGoogleAccessToken(
      authorized.api.userId,
      (accessToken) =>
        readWorksheetRecords(
          accessToken,
          authorized.spreadsheetId,
          authorized.api.worksheetId,
        ),
    );

    const unknownColumn = unknownPublicFilterColumn(
      filters.filters,
      records.columns,
    );

    if (unknownColumn) {
      return publicError(
        "INVALID_INPUT",
        publicApiUnknownFilterMessage(unknownColumn),
        400,
      );
    }

    return publicJson(
      pageWorksheetRows(
        filterWorksheetRows(records.rows, filters.filters, filters.search),
        page.page,
      ),
    );
  } catch (error) {
    return publicApiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const authorized = await authorizePublicApi(request, slug);

    if (authorized instanceof Response) {
      return authorized;
    }

    const body = await readWriteBody(request);

    if (body instanceof Response) {
      return body;
    }

    const used = await markAuthorizedKeyUsed(authorized);

    if (used) {
      return used;
    }

    const result = await withGoogleAccessToken(
      authorized.api.userId,
      async (accessToken) => {
        const records = await readWorksheetRecords(
          accessToken,
          authorized.spreadsheetId,
          authorized.api.worksheetId,
        );
        const validated = validatePublicRowBody(
          body,
          records.columns,
          "create",
        );

        if (!validated.ok) {
          return { ok: false as const, message: validated.message };
        }

        const rowNumber = await appendWorksheetRow(
          accessToken,
          authorized.spreadsheetId,
          authorized.api.worksheetId,
          validated.values,
          records.rows.length,
        );

        return {
          ok: true as const,
          row: validated.row,
          rowNumber,
        };
      },
    );

    if (!result.ok) {
      return publicError("INVALID_INPUT", result.message, 400);
    }

    return publicJson(
      {
        success: true,
        row: result.row,
        rowNumber: result.rowNumber,
      },
      201,
    );
  } catch (error) {
    return publicApiErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return writeExistingRow(request, params, "replace");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return writeExistingRow(request, params, "patch");
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const authorized = await authorizePublicApi(request, slug);

    if (authorized instanceof Response) {
      return authorized;
    }

    const rowNumberResult = readPublicRowNumber(
      new URL(request.url).searchParams,
    );

    if (!rowNumberResult.ok) {
      return publicError("INVALID_INPUT", rowNumberResult.message, 400);
    }

    const used = await markAuthorizedKeyUsed(authorized);

    if (used) {
      return used;
    }

    const result = await withGoogleAccessToken(
      authorized.api.userId,
      async (accessToken) => {
        const records = await readWorksheetRecords(
          accessToken,
          authorized.spreadsheetId,
          authorized.api.worksheetId,
        );

        if (
          !isPublicRowInRange(rowNumberResult.rowNumber, records.rows.length)
        ) {
          return {
            ok: false as const,
            message: publicRowOutOfRangeMessage(rowNumberResult.rowNumber),
          };
        }

        const indexes = deleteDimensionIndexes(rowNumberResult.rowNumber);

        await deleteWorksheetRow(
          accessToken,
          authorized.spreadsheetId,
          authorized.api.worksheetId,
          indexes.startIndex,
          indexes.endIndex,
        );

        return { ok: true as const, rowNumber: rowNumberResult.rowNumber };
      },
    );

    if (!result.ok) {
      return publicError("INVALID_INPUT", result.message, 400);
    }

    return publicJson({
      success: true,
      deleted: true,
      rowNumber: result.rowNumber,
    });
  } catch (error) {
    return publicApiErrorResponse(error);
  }
}

async function writeExistingRow(
  request: Request,
  params: Promise<{ slug: string }>,
  mode: "replace" | "patch",
) {
  try {
    const { slug } = await params;
    const authorized = await authorizePublicApi(request, slug);

    if (authorized instanceof Response) {
      return authorized;
    }

    const rowNumberResult = readPublicRowNumber(
      new URL(request.url).searchParams,
    );

    if (!rowNumberResult.ok) {
      return publicError("INVALID_INPUT", rowNumberResult.message, 400);
    }

    const body = await readWriteBody(request);

    if (body instanceof Response) {
      return body;
    }

    const used = await markAuthorizedKeyUsed(authorized);

    if (used) {
      return used;
    }

    const result = await withGoogleAccessToken(
      authorized.api.userId,
      async (accessToken) => {
        const records = await readWorksheetRecords(
          accessToken,
          authorized.spreadsheetId,
          authorized.api.worksheetId,
        );

        if (
          !isPublicRowInRange(rowNumberResult.rowNumber, records.rows.length)
        ) {
          return {
            ok: false as const,
            message: publicRowOutOfRangeMessage(rowNumberResult.rowNumber),
          };
        }

        const validated = validatePublicRowBody(body, records.columns, mode);

        if (!validated.ok) {
          return { ok: false as const, message: validated.message };
        }

        const dataIndex = rowNumberResult.rowNumber - 2;
        const existing = records.rows[dataIndex] ?? {};
        const next =
          mode === "patch"
            ? mergePatchedRow(existing, records.columns, validated.row)
            : { values: validated.values, row: validated.row };

        await updateWorksheetRow(
          accessToken,
          authorized.spreadsheetId,
          authorized.api.worksheetId,
          rowNumberResult.rowNumber,
          next.values,
        );

        return {
          ok: true as const,
          row: next.row,
          rowNumber: rowNumberResult.rowNumber,
        };
      },
    );

    if (!result.ok) {
      return publicError("INVALID_INPUT", result.message, 400);
    }

    return publicJson({
      success: true,
      row: result.row,
      rowNumber: result.rowNumber,
    });
  } catch (error) {
    return publicApiErrorResponse(error);
  }
}
