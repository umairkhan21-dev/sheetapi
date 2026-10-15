import { getCurrentUser } from "@/lib/auth";
import { buildPublicApiUrl, readApiUpdate } from "@/lib/api-config";
import { readRouteId } from "@/lib/api-key";
import { deleteOwnedApi, updateOwnedApi } from "@/lib/api-key-store";
import { managementError, managementJson } from "@/lib/api-management-response";
import { getAppUrl } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPDATE_BODY_LENGTH = 4_096;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ apiId: string }> },
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return managementError("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const { apiId: apiIdParam } = await params;
    const apiId = readRouteId(apiIdParam);

    if (apiId == null) {
      return managementError("NOT_FOUND", "This API was not found.", 404);
    }

    const input = await readUpdateBody(request);

    if (!input.ok) {
      return managementError("INVALID_INPUT", input.message, 400);
    }

    const updated = await updateOwnedApi(user.id, apiId, input.changes);

    if (!updated) {
      return managementError("NOT_FOUND", "This API was not found.", 404);
    }

    return managementJson({
      success: true,
      api: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        spreadsheetId: updated.spreadsheetId,
        worksheetId: updated.worksheetId,
        worksheetName: updated.worksheetName,
        status: updated.status,
        url: buildPublicApiUrl(getAppUrl(), updated.slug),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error(
      "API update failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return managementError(
      "INTERNAL_ERROR",
      "The API could not be updated. Try again.",
      500,
    );
  }
}

async function readUpdateBody(request: Request) {
  const body = await request.text();

  if (body.length === 0 || body.length > MAX_UPDATE_BODY_LENGTH) {
    return {
      ok: false as const,
      message: "Enter a new name or choose Active or Disabled.",
    };
  }

  try {
    return readApiUpdate(JSON.parse(body));
  } catch {
    return {
      ok: false as const,
      message: "Enter a new name or choose Active or Disabled.",
    };
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ apiId: string }> },
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return managementError("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const { apiId: apiIdParam } = await params;
    const apiId = readRouteId(apiIdParam);

    if (apiId == null) {
      return managementError("NOT_FOUND", "This API was not found.", 404);
    }

    const deleted = await deleteOwnedApi(user.id, apiId);

    if (!deleted) {
      return managementError("NOT_FOUND", "This API was not found.", 404);
    }

    return managementJson({ success: true });
  } catch (error) {
    console.error(
      "API deletion failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return managementError(
      "INTERNAL_ERROR",
      "The API could not be deleted. Try again.",
      500,
    );
  }
}
