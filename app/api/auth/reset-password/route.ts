import bcrypt from "bcrypt";
import { clearAuthCookie } from "@/lib/auth";
import {
  BCRYPT_ROUNDS,
  PASSWORD_RESET_INVALID_MESSAGE,
  getPasswordValidationError,
} from "@/lib/password";
import { hashResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_TOKEN_LENGTH = 256;

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
    const body = await readJsonObject(request);

    if (!body) {
      return jsonError("Invalid request body.", 400);
    }

    const { token, password } = body;

    if (typeof token !== "string" || typeof password !== "string") {
      return jsonError("A reset token and password are required.", 400);
    }

    const passwordError = getPasswordValidationError(password);

    if (passwordError) {
      return jsonError(passwordError, 400);
    }

    if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
      return jsonError(PASSWORD_RESET_INVALID_MESSAGE, 400);
    }

    const tokenHash = hashResetToken(token);
    const existingToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        usedAt: true,
        expiresAt: true,
      },
    });
    const now = new Date();

    if (
      !existingToken ||
      existingToken.usedAt ||
      existingToken.expiresAt <= now
    ) {
      return jsonError(PASSWORD_RESET_INVALID_MESSAGE, 400);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const reset = await prisma.$transaction(async (tx) => {
      const changedAt = new Date();
      const marked = await tx.passwordResetToken.updateMany({
        where: {
          id: existingToken.id,
          usedAt: null,
          expiresAt: { gt: changedAt },
        },
        data: { usedAt: changedAt },
      });

      if (marked.count !== 1) {
        return false;
      }

      const record = await tx.passwordResetToken.findUnique({
        where: { id: existingToken.id },
        select: { userId: true },
      });

      if (!record) {
        throw new Error("Password reset could not be completed");
      }

      await tx.user.update({
        where: { id: record.userId },
        data: {
          password: passwordHash,
          passwordChangedAt: changedAt,
        },
      });

      return true;
    });

    if (!reset) {
      return jsonError(PASSWORD_RESET_INVALID_MESSAGE, 400);
    }

    await clearAuthCookie();

    return Response.json({
      message: "Your password has been reset.",
    });
  } catch {
    console.error("Password reset failed");
    return jsonError("Something went wrong.", 500);
  }
}
