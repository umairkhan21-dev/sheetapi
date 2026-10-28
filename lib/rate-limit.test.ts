import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, describe, it } from "node:test";
import { prisma } from "./prisma";
import {
  authRateLimitResponse,
  clientIpFromRequest,
  consumeRateLimit,
  rateLimitIdentityFromAuthorization,
} from "./rate-limit";
import { publicRateLimitedResponse } from "./public-api-error";

const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const createdKeys: string[] = [];

after(async () => {
  if (createdKeys.length > 0) {
    await prisma.rateLimitBucket.deleteMany({
      where: { id: { in: createdKeys } },
    });
  }

  await Promise.race([
    prisma.$disconnect(),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
});

describe("rate limiting", () => {
  it("allows requests under the limit and returns 429 metadata when exceeded", async () => {
    const key = `test:rate:${stamp}`;
    createdKeys.push(key);

    const first = await consumeRateLimit({
      key,
      limit: 2,
      windowSeconds: 60,
    });
    const second = await consumeRateLimit({
      key,
      limit: 2,
      windowSeconds: 60,
    });
    const third = await consumeRateLimit({
      key,
      limit: 2,
      windowSeconds: 60,
    });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(third.ok, false);

    if (!third.ok) {
      assert.equal(third.retryAfterSeconds >= 1, true);
      const authResponse = authRateLimitResponse(third);
      assert.equal(authResponse.status, 429);
      assert.equal(
        authResponse.headers.get("Retry-After"),
        String(third.retryAfterSeconds),
      );
      const body = (await authResponse.json()) as { error?: unknown };
      assert.equal(typeof body.error, "string");
      assert.equal(JSON.stringify(body).toLowerCase().includes("password"), false);
      assert.equal(JSON.stringify(body).toLowerCase().includes("token"), false);

      const publicResponse = publicRateLimitedResponse(third.retryAfterSeconds);
      assert.equal(publicResponse.status, 429);
      assert.equal(
        publicResponse.headers.get("Retry-After"),
        String(third.retryAfterSeconds),
      );
      assert.equal(
        publicResponse.headers.get("Access-Control-Allow-Origin"),
        "*",
      );
      const publicBody = (await publicResponse.json()) as {
        error?: { code?: unknown };
      };
      assert.equal(publicBody.error?.code, "RATE_LIMITED");
    }
  });

  it("derives client IP and hashes Authorization without retaining the secret", () => {
    const request = new Request("http://localhost/api/auth/login", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        authorization: "Bearer sk_live_super_secret_value",
      },
    });

    const previousHops = process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS;
    delete process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS;

    try {
      assert.equal(clientIpFromRequest(request), "unknown");
    } finally {
      if (previousHops === undefined) {
        delete process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS;
      } else {
        process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS = previousHops;
      }
    }
    const identity = rateLimitIdentityFromAuthorization(
      request.headers.get("authorization"),
    );
    assert.equal(typeof identity, "string");
    assert.equal(identity?.includes("sk_live"), false);
    assert.equal(identity?.includes("super_secret"), false);
  });
});
