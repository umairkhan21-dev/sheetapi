import { isIP } from "node:net";

const FORWARDED_HEADER_MAX_LENGTH = 2_000;
const MAX_TRUSTED_PROXY_HOPS = 5;

/**
 * How many reverse proxies in front of this process append the peer they
 * saw onto X-Forwarded-For. The platform is not selected yet, and the
 * Fetch request does not include the TCP peer address.
 *
 * Unset or 0: ignore X-Forwarded-For and X-Real-IP. Every caller without
 * an API key shares the identity "unknown".
 * 1–5: use the address that many entries from the right. A single proxy
 * that appends, or replaces the header with the connecting address, is 1.
 * Do not set this when clients can reach the process directly. A value
 * larger than the real proxy chain lets the caller choose the identity.
 */
export const RATE_LIMIT_TRUSTED_PROXY_HOPS = "RATE_LIMIT_TRUSTED_PROXY_HOPS";

export function trustedProxyHops() {
  const raw = process.env[RATE_LIMIT_TRUSTED_PROXY_HOPS]?.trim() ?? "";

  if (!/^[1-5]$/.test(raw)) {
    return 0;
  }

  return Number(raw);
}

export function clientIpFromRequest(request: Request): string {
  const hops = trustedProxyHops();

  if (hops === 0 || hops > MAX_TRUSTED_PROXY_HOPS) {
    return "unknown";
  }

  const forwarded = request.headers.get("x-forwarded-for");

  if (
    forwarded == null ||
    forwarded.length === 0 ||
    forwarded.length > FORWARDED_HEADER_MAX_LENGTH
  ) {
    return "unknown";
  }

  const parts = forwarded.split(",");

  if (parts.length < hops) {
    return "unknown";
  }

  const selected = parts[parts.length - hops]?.trim() ?? "";

  return canonicalIp(selected) ?? "unknown";
}

function canonicalIp(value: string) {
  if (value.length === 0 || value.length > 128 || value.includes("%")) {
    return null;
  }

  const version = isIP(value);

  if (version === 4) {
    return canonicalIpv4(value);
  }

  if (version === 6) {
    return canonicalIpv6(value);
  }

  return null;
}

function canonicalIpv4(value: string) {
  const parts = value.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const octets: number[] = [];

  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith("0"))) {
      return null;
    }

    const octet = Number(part);

    if (octet > 255) {
      return null;
    }

    octets.push(octet);
  }

  return octets.join(".");
}

function canonicalIpv6(value: string) {
  let text = value.toLowerCase();
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);

  if (tail.includes(".")) {
    const mapped = canonicalIpv4(tail);

    if (!mapped) {
      return null;
    }

    const octets = mapped.split(".").map(Number);
    const high = ((octets[0]! << 8) | octets[1]!).toString(16);
    const low = ((octets[2]! << 8) | octets[3]!).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = text.split("::");

  if (halves.length > 2) {
    return null;
  }

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  if (halves.length === 1 && left.length !== 8) {
    return null;
  }

  const missing = 8 - left.length - right.length;

  if (halves.length === 2 && missing < 1) {
    return null;
  }

  const groups = [
    ...left,
    ...(halves.length === 2 ? Array<string>(missing).fill("0") : []),
    ...right,
  ];

  if (groups.length !== 8) {
    return null;
  }

  const numbers: number[] = [];

  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return null;
    }

    numbers.push(Number.parseInt(group, 16));
  }

  if (
    numbers[0] === 0 &&
    numbers[1] === 0 &&
    numbers[2] === 0 &&
    numbers[3] === 0 &&
    numbers[4] === 0 &&
    numbers[5] === 0xffff
  ) {
    const high = numbers[6] ?? 0;
    const low = numbers[7] ?? 0;

    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }

  let bestStart = -1;
  let bestLength = 0;
  let index = 0;

  while (index < numbers.length) {
    if (numbers[index] !== 0) {
      index += 1;
      continue;
    }

    let end = index;

    while (end < numbers.length && numbers[end] === 0) {
      end += 1;
    }

    if (end - index > bestLength) {
      bestStart = index;
      bestLength = end - index;
    }

    index = end;
  }

  const rendered = numbers.map((number) => number.toString(16));

  if (bestLength >= 2) {
    const head = rendered.slice(0, bestStart).join(":");
    const tailGroups = rendered.slice(bestStart + bestLength).join(":");

    return `${head}::${tailGroups}`;
  }

  return rendered.join(":");
}
