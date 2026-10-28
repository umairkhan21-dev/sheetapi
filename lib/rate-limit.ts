import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export { RATE_LIMIT_TRUSTED_PROXY_HOPS, clientIpFromRequest } from "@/lib/client-ip";

export type RateLimitResult =
  | { ok: true; remaining: number; resetAtMs: number }
  | { ok: false; retryAfterSeconds: number; resetAtMs: number };

export type RateLimitPolicy = {
  key: string;
  limit: number;
  windowSeconds: number;
};

const KEY_MAX_LENGTH = 128;

/**
 * Fixed-window counter stored in MariaDB so limits are shared across instances.
 * Uses a single-row upsert; suitable for auth and public API abuse protection.
 */
export function isRateLimitingEnabled() {
  if (process.env.RATE_LIMIT_DISABLED === "true" || process.env.RATE_LIMIT_DISABLED === "1") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RATE_LIMIT_DISABLED cannot be enabled in production");
    }

    return false;
  }

  return true;
}

export async function consumeRateLimit(
  policy: RateLimitPolicy,
  nowMs = Date.now(),
): Promise<RateLimitResult> {
  if (!isRateLimitingEnabled()) {
    return {
      ok: true,
      remaining: policy.limit,
      resetAtMs: nowMs + Math.max(1, policy.windowSeconds) * 1000,
    };
  }

  const key = normalizeKey(policy.key);
  const limit = Math.max(1, Math.floor(policy.limit));
  const windowMs = Math.max(1, Math.floor(policy.windowSeconds)) * 1000;
  const now = new Date(nowMs);
  const resetAt = new Date(nowMs + windowMs);

  await prisma.$executeRaw`
    INSERT INTO \`RateLimitBucket\` (\`id\`, \`count\`, \`resetAt\`, \`updatedAt\`)
    VALUES (${key}, 1, ${resetAt}, ${now})
    ON DUPLICATE KEY UPDATE
      \`count\` = IF(\`resetAt\` <= ${now}, 1, \`count\` + 1),
      \`resetAt\` = IF(\`resetAt\` <= ${now}, ${resetAt}, \`resetAt\`),
      \`updatedAt\` = ${now}
  `;

  const rows = await prisma.$queryRaw<
    Array<{ count: number | bigint; resetAt: Date }>
  >`
    SELECT \`count\`, \`resetAt\`
    FROM \`RateLimitBucket\`
    WHERE \`id\` = ${key}
    LIMIT 1
  `;

  const row = rows[0];

  if (!row) {
    return { ok: true, remaining: limit - 1, resetAtMs: resetAt.getTime() };
  }

  const count = Number(row.count);
  const bucketResetMs = new Date(row.resetAt).getTime();

  if (!Number.isFinite(count) || count <= limit) {
    return {
      ok: true,
      remaining: Math.max(0, limit - count),
      resetAtMs: bucketResetMs,
    };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucketResetMs - nowMs) / 1000),
  );

  return {
    ok: false,
    retryAfterSeconds,
    resetAtMs: bucketResetMs,
  };
}

/** Hash a bearer value for rate-limit identity without retaining the secret. */
export function rateLimitIdentityFromAuthorization(
  authorization: string | null,
): string | null {
  if (!authorization) {
    return null;
  }

  const trimmed = authorization.trim();

  if (!trimmed || trimmed.length > 512) {
    return null;
  }

  return createHash("sha256").update(trimmed).digest("hex").slice(0, 32);
}

export function authRateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return Response.json(
    { error: "Too many requests. Try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}

function normalizeKey(key: string) {
  const trimmed = key.trim();

  if (!trimmed) {
    return "empty";
  }

  if (trimmed.length <= KEY_MAX_LENGTH) {
    return trimmed;
  }

  return createHash("sha256").update(trimmed).digest("hex").slice(0, KEY_MAX_LENGTH);
}

const productionLimits = process.env.NODE_ENV === "production";

export const AUTH_RATE_LIMITS = {
  register: {
    limit: productionLimits ? 5 : 500,
    windowSeconds: 15 * 60,
  },
  login: {
    limit: productionLimits ? 20 : 500,
    windowSeconds: 15 * 60,
  },
  forgotPassword: {
    limit: productionLimits ? 5 : 500,
    windowSeconds: 15 * 60,
  },
  resetPassword: {
    limit: productionLimits ? 10 : 500,
    windowSeconds: 15 * 60,
  },
} as const;

export const PUBLIC_API_RATE_LIMIT = {
  limit: productionLimits ? 120 : 5_000,
  windowSeconds: 60,
} as const;
