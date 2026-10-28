import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getJwtSecret } from "@/lib/jwt-secret";
import { prisma } from "@/lib/prisma";
import { cookiesMustUseSecureFlag } from "@/lib/secure-cookies";

export const AUTH_COOKIE_NAME = "auth_token";
export { resetJwtSecretCacheForTests } from "@/lib/jwt-secret";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AuthUser = {
  id: number;
  name: string;
  email: string;
};

type AuthTokenPayload = {
  userId: number;
  issuedAt: number;
};

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function authCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookiesMustUseSecureFlag(),
    path: "/",
    maxAge,
  };
}

export function createAuthToken(userId: number) {
  const secret = getJwtSecret();
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      sub: String(userId),
      iat: issuedAt,
      exp: issuedAt + SESSION_MAX_AGE_SECONDS,
    }),
  );
  const signature = sign(`${header}.${payload}`, secret);

  return `${header}.${payload}.${signature}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  if (token.length === 0 || token.length > 4096) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [headerSegment, payloadSegment, signature] = parts;

  if (!headerSegment || !payloadSegment || !signature) {
    return null;
  }

  const expectedSignature = sign(
    `${headerSegment}.${payloadSegment}`,
    getJwtSecret(),
  );
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const header = JSON.parse(decodeBase64Url(headerSegment)) as {
      alg?: unknown;
      typ?: unknown;
    };

    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return null;
    }

    const payload = JSON.parse(decodeBase64Url(payloadSegment)) as {
      sub?: unknown;
      iat?: unknown;
      exp?: unknown;
    };
    const now = Math.floor(Date.now() / 1000);

    if (
      typeof payload.sub !== "string" ||
      !/^[1-9]\d*$/.test(payload.sub) ||
      typeof payload.exp !== "number" ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= now ||
      typeof payload.iat !== "number" ||
      !Number.isInteger(payload.iat) ||
      payload.iat > now + 60
    ) {
      return null;
    }

    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId)) {
      return null;
    }

    return { userId, issuedAt: payload.iat };
  } catch {
    return null;
  }
}

export async function setAuthCookie(userId: number) {
  const cookieStore = await cookies();
  cookieStore.set(
    AUTH_COOKIE_NAME,
    createAuthToken(userId),
    authCookieOptions(),
  );
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, "", authCookieOptions(0));
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = verifyAuthToken(token);

  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      email: true,
      passwordChangedAt: true,
    },
  });

  if (!user) {
    return null;
  }

  // JWTs store iat in seconds. A login created in the same second as a reset stays valid.
  if (
    user.passwordChangedAt &&
    payload.issuedAt < Math.floor(user.passwordChangedAt.getTime() / 1000)
  ) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}
