import { getCurrentUser } from "@/lib/auth";
import { readApiKeyName, readRouteId } from "@/lib/api-key";
import { createOwnedApiKey, listOwnedApiKeys } from "@/lib/api-key-store";
import { managementError, managementJson } from "@/lib/api-management-response";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 2_048;

async function requireOwnedApiId(apiIdParam: string) {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false as const,
      response: managementError("UNAUTHORIZED", "Sign in to continue.", 401),
    };
  }

  const apiId = readRouteId(apiIdParam);

  if (apiId == null) {
    return {
      ok: false as const,
      response: managementError("NOT_FOUND", "This API was not found.", 404),
    };
  }

  return { ok: true as const, userId: user.id, apiId };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ apiId: string }> },
) {
  try {
    const { apiId: apiIdParam } = await params;
    const owner = await requireOwnedApiId(apiIdParam);

    if (!owner.ok) {
      return owner.response;
    }

    const keys = await listOwnedApiKeys(owner.userId, owner.apiId);

    if (!keys) {
      return managementError("NOT_FOUND", "This API was not found.", 404);
    }

    return managementJson({
      success: true,
      keys,
    });
  } catch (error) {
    console.error(
      "API key list failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return managementError("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ apiId: string }> },
) {
  try {
    const { apiId: apiIdParam } = await params;
    const owner = await requireOwnedApiId(apiIdParam);

    if (!owner.ok) {
      return owner.response;
    }

    const name = await readKeyName(request);

    if (!name) {
      return managementError(
        "INVALID_INPUT",
        "Enter a key name up to 80 characters.",
        400,
      );
    }

    const created = await createOwnedApiKey(owner.userId, owner.apiId, name);

    if (!created.ok) {
      return managementError("NOT_FOUND", "This API was not found.", 404);
    }

    return managementJson(
      {
        success: true,
        key: {
          ...created.key,
          secret: created.secret,
        },
      },
      201,
    );
  } catch (error) {
    console.error(
      "API key creation failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return managementError(
      "INTERNAL_ERROR",
      "The API key could not be created. Try again.",
      500,
    );
  }
}

async function readKeyName(request: Request) {
  const body = await request.text();

  if (body.length === 0 || body.length > MAX_BODY_LENGTH) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(body);

    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return null;
    }

    return readApiKeyName((payload as { name?: unknown }).name);
  } catch {
    return null;
  }
}
