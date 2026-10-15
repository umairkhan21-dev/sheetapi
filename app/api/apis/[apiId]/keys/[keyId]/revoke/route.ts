import { getCurrentUser } from "@/lib/auth";
import { readRouteId } from "@/lib/api-key";
import { revokeOwnedApiKey } from "@/lib/api-key-store";
import { managementError, managementJson } from "@/lib/api-management-response";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ apiId: string; keyId: string }> },
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return managementError("UNAUTHORIZED", "Sign in to continue.", 401);
    }

    const { apiId: apiIdParam, keyId: keyIdParam } = await params;
    const apiId = readRouteId(apiIdParam);
    const keyId = readRouteId(keyIdParam);

    if (apiId == null) {
      return managementError("NOT_FOUND", "This API was not found.", 404);
    }

    if (keyId == null) {
      return managementError("NOT_FOUND", "This API key was not found.", 404);
    }

    const revoked = await revokeOwnedApiKey(user.id, apiId, keyId);

    if (!revoked.ok && revoked.reason === "api_not_found") {
      return managementError("NOT_FOUND", "This API was not found.", 404);
    }

    if (!revoked.ok) {
      return managementError("NOT_FOUND", "This API key was not found.", 404);
    }

    return managementJson({
      success: true,
      key: revoked.key,
    });
  } catch (error) {
    console.error(
      "API key revocation failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return managementError("INTERNAL_ERROR", "Something went wrong.", 500);
  }
}
