import bcrypt from "bcrypt";
import { setAuthCookie } from "@/lib/auth";
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
const DUMMY_PASSWORD_HASH =
  "$2b$12$zl8fs.HzMVqoZItH1xmLdOPVg/zChAKFpILekTu8ukT/6Tp2eRLXi";

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
      key: `auth:login:${clientIpFromRequest(request)}`,
      limit: AUTH_RATE_LIMITS.login.limit,
      windowSeconds: AUTH_RATE_LIMITS.login.windowSeconds,
    });

    if (!limited.ok) {
      return authRateLimitResponse(limited);
    }

    const body = await readJsonObject(request);

    if (!body) {
      return jsonError("Invalid request body.", 400);
    }

    const { email, password } = body;

    if (typeof email !== "string" || typeof password !== "string") {
      return jsonError("Email and password are required.", 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return jsonError("Email and password are required.", 400);
    }

    if (
      normalizedEmail.length > MAX_EMAIL_LENGTH ||
      !EMAIL_PATTERN.test(normalizedEmail)
    ) {
      return jsonError("A valid email address is required.", 400);
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    const passwordMatches = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    if (!user?.password || !passwordMatches) {
      return jsonError("Invalid email or password.", 401);
    }

    await setAuthCookie(user.id);

    return Response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch {
    console.error("Login failed");
    return jsonError("Something went wrong.", 500);
  }
}
