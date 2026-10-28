import { Prisma } from "@/app/generated/prisma/client";
import bcrypt from "bcrypt";
import { setAuthCookie } from "@/lib/auth";
import { BCRYPT_ROUNDS, getPasswordValidationError } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  AUTH_RATE_LIMITS,
  authRateLimitResponse,
  clientIpFromRequest,
  consumeRateLimit,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_NAME_LENGTH = 191;
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
      key: `auth:register:${clientIpFromRequest(request)}`,
      limit: AUTH_RATE_LIMITS.register.limit,
      windowSeconds: AUTH_RATE_LIMITS.register.windowSeconds,
    });

    if (!limited.ok) {
      return authRateLimitResponse(limited);
    }

    const body = await readJsonObject(request);

    if (!body) {
      return jsonError("Invalid request body.", 400);
    }

    const { name, email, password } = body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return jsonError("Name, email, and password are required.", 400);
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName || normalizedName.length > MAX_NAME_LENGTH) {
      return jsonError("Name is required.", 400);
    }

    if (
      !normalizedEmail ||
      normalizedEmail.length > MAX_EMAIL_LENGTH ||
      !EMAIL_PATTERN.test(normalizedEmail)
    ) {
      return jsonError("A valid email address is required.", 400);
    }

    const passwordError = getPasswordValidationError(password);

    if (passwordError) {
      return jsonError(passwordError, 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return jsonError("An account with this email already exists.", 409);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        name: normalizedName,
        email: normalizedEmail,
        password: passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    await setAuthCookie(user.id);

    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError("An account with this email already exists.", 409);
    }

    console.error("Registration failed");
    return jsonError("Something went wrong.", 500);
  }
}
