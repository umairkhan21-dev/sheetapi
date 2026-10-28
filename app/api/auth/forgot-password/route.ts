import {
  assertPasswordResetDeliveryReady,
  buildPasswordResetUrl,
  getAppUrl,
  sendPasswordResetEmail,
} from "@/lib/email";
import { PASSWORD_RESET_REQUEST_MESSAGE } from "@/lib/password";
import { issuePasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import {
  AUTH_RATE_LIMITS,
  authRateLimitResponse,
  clientIpFromRequest,
  consumeRateLimit,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_EMAIL_LENGTH = 191;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

async function readJsonObject(request: Request) {
  try {
    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return null;
    }

    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const limited = await consumeRateLimit({
      key: `auth:forgot:${clientIpFromRequest(request)}`,
      limit: AUTH_RATE_LIMITS.forgotPassword.limit,
      windowSeconds: AUTH_RATE_LIMITS.forgotPassword.windowSeconds,
    });

    if (!limited.ok) {
      return authRateLimitResponse(limited);
    }

    const body = await readJsonObject(request);

    if (!body) {
      return jsonError("Invalid request body.", 400);
    }

    const { email } = body;

    if (typeof email !== "string") {
      return jsonError("A valid email address is required.", 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (
      !normalizedEmail ||
      normalizedEmail.length > MAX_EMAIL_LENGTH ||
      !EMAIL_PATTERN.test(normalizedEmail)
    ) {
      return jsonError("A valid email address is required.", 400);
    }

    try {
      assertPasswordResetDeliveryReady();
    } catch {
      console.error("Password reset delivery is not configured");
      return jsonError("Something went wrong.", 500);
    }

    const appUrl = getAppUrl();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (user) {
      const token = await issuePasswordResetToken(user.id);

      try {
        await sendPasswordResetEmail(
          normalizedEmail,
          buildPasswordResetUrl(appUrl, token),
        );
      } catch {
        console.error("Failed to send password reset email");
      }
    }

    return Response.json({ message: PASSWORD_RESET_REQUEST_MESSAGE });
  } catch {
    console.error("Forgot password failed");
    return jsonError("Something went wrong.", 500);
  }
}
