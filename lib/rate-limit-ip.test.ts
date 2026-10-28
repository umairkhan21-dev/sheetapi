import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  RATE_LIMIT_TRUSTED_PROXY_HOPS,
  clientIpFromRequest,
} from "./client-ip";

const env = process.env as Record<string, string | undefined>;
const ORIGINAL_HOPS = env[RATE_LIMIT_TRUSTED_PROXY_HOPS];

afterEach(() => {
  if (ORIGINAL_HOPS === undefined) {
    delete env[RATE_LIMIT_TRUSTED_PROXY_HOPS];
  } else {
    env[RATE_LIMIT_TRUSTED_PROXY_HOPS] = ORIGINAL_HOPS;
  }
});

function requestWith(headers: HeadersInit) {
  return new Request("http://localhost/api/auth/login", { headers });
}

function identitiesFor(headersList: HeadersInit[]) {
  return headersList.map((headers) => clientIpFromRequest(requestWith(headers)));
}

describe("client IP rate-limit identity", () => {
  it("ignores caller-supplied forwarded headers when no proxy is trusted", () => {
    for (const hops of [undefined, "", "0", "6", "01", "-1", "1.5", "abc"]) {
      if (hops === undefined) {
        delete env[RATE_LIMIT_TRUSTED_PROXY_HOPS];
      } else {
        env[RATE_LIMIT_TRUSTED_PROXY_HOPS] = hops;
      }

      const identities = identitiesFor([
        { "x-forwarded-for": "203.0.113.10" },
        { "x-forwarded-for": "198.51.100.20" },
        { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
        { "x-forwarded-for": "198.51.100.20, 10.0.0.1" },
        { "x-real-ip": "203.0.113.10" },
        { "x-real-ip": "198.51.100.20", "x-forwarded-for": "192.0.2.1" },
        {},
      ]);

      assert.deepEqual(identities, Array(identities.length).fill("unknown"), hops);
    }
  });

  it("uses the proxy-appended address and ignores addresses to its left", () => {
    env[RATE_LIMIT_TRUSTED_PROXY_HOPS] = "1";

    const first = clientIpFromRequest(
      requestWith({ "x-forwarded-for": "192.0.2.1, 203.0.113.10" }),
    );
    const rotated = clientIpFromRequest(
      requestWith({ "x-forwarded-for": "198.51.100.99, 203.0.113.10" }),
    );
    const otherClient = clientIpFromRequest(
      requestWith({ "x-forwarded-for": "192.0.2.1, 203.0.113.11" }),
    );

    assert.equal(first, "203.0.113.10");
    assert.equal(rotated, first);
    assert.equal(otherClient, "203.0.113.11");
    assert.notEqual(otherClient, first);
  });

  it("keeps one identity when only the caller-supplied prefix changes", () => {
    env[RATE_LIMIT_TRUSTED_PROXY_HOPS] = "2";

    const seen = clientIpFromRequest(
      requestWith({
        "x-forwarded-for": "192.0.2.8, 203.0.113.10, 10.0.0.4",
      }),
    );
    const rotated = clientIpFromRequest(
      requestWith({
        "x-forwarded-for": "198.51.100.8, 203.0.113.10, 10.0.0.4",
      }),
    );

    assert.equal(seen, "203.0.113.10");
    assert.equal(rotated, seen);
  });

  it("rejects a missing, empty, short, or oversized forwarded list", () => {
    env[RATE_LIMIT_TRUSTED_PROXY_HOPS] = "1";

    assert.equal(clientIpFromRequest(requestWith({})), "unknown");
    assert.equal(
      clientIpFromRequest(requestWith({ "x-forwarded-for": "" })),
      "unknown",
    );
    assert.equal(
      clientIpFromRequest(requestWith({ "x-forwarded-for": " , " })),
      "unknown",
    );
    assert.equal(
      clientIpFromRequest(requestWith({ "x-real-ip": "203.0.113.10" })),
      "unknown",
    );

    env[RATE_LIMIT_TRUSTED_PROXY_HOPS] = "2";
    assert.equal(
      clientIpFromRequest(requestWith({ "x-forwarded-for": "203.0.113.10" })),
      "unknown",
    );

    env[RATE_LIMIT_TRUSTED_PROXY_HOPS] = "1";
    const huge = `${"203.0.113.10,".repeat(200)}198.51.100.20`;
    assert.equal(huge.length > 2_000, true);
    assert.equal(
      clientIpFromRequest(requestWith({ "x-forwarded-for": huge })),
      "unknown",
    );
    assert.equal(
      clientIpFromRequest(
        requestWith({ "x-forwarded-for": huge.replaceAll("203", "198") }),
      ),
      "unknown",
    );
  });

  it("does not give malformed forwarded values distinct identities", () => {
    env[RATE_LIMIT_TRUSTED_PROXY_HOPS] = "1";

    const malformed = [
      "not-an-ip",
      "999.1.1.1",
      "203.0.113.010",
      "203.0.113.10:443",
      "203.0.113.10, not-an-ip",
      "203.0.113.10, 198.51.100.020",
      "localhost",
      "2001:db8::1%eth0",
    ];

    assert.deepEqual(
      malformed.map((value) =>
        clientIpFromRequest(requestWith({ "x-forwarded-for": value })),
      ),
      malformed.map(() => "unknown"),
    );
  });

  it("canonicalizes equivalent addresses so they share one identity", () => {
    env[RATE_LIMIT_TRUSTED_PROXY_HOPS] = "1";

    assert.equal(
      clientIpFromRequest(
        requestWith({ "x-forwarded-for": " 203.0.113.10 " }),
      ),
      "203.0.113.10",
    );
    assert.equal(
      clientIpFromRequest(
        requestWith({
          "x-forwarded-for": "2001:0db8:0000:0000:0000:0000:0000:0001",
        }),
      ),
      clientIpFromRequest(
        requestWith({ "x-forwarded-for": "2001:DB8::1" }),
      ),
    );
    assert.equal(
      clientIpFromRequest(
        requestWith({ "x-forwarded-for": "::ffff:203.0.113.10" }),
      ),
      clientIpFromRequest(
        requestWith({ "x-forwarded-for": "::ffff:cb00:710a" }),
      ),
    );
    assert.equal(
      clientIpFromRequest(
        requestWith({ "x-forwarded-for": "::ffff:203.0.113.10" }),
      ),
      "203.0.113.10",
    );
  });

  it("uses the last forwarded header value when a proxy appends one", () => {
    env[RATE_LIMIT_TRUSTED_PROXY_HOPS] = "1";
    const headers = new Headers();
    headers.append("x-forwarded-for", "192.0.2.1");
    headers.append("x-forwarded-for", "203.0.113.10");

    assert.equal(clientIpFromRequest(requestWith(headers)), "203.0.113.10");
  });
});
