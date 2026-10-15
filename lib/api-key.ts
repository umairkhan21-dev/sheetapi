import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeApiName } from "@/lib/api-config";

export const API_KEY_PREFIX = "sk_live_";
const API_KEY_RANDOM_BYTES = 32;
const API_KEY_PREFIX_RANDOM_LENGTH = 8;
const API_KEY_RANDOM_LENGTH = 43;
const MYSQL_SIGNED_INT_MAX = 2_147_483_647;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SECRET_PATTERN = /^sk_live_[A-Za-z0-9_-]{43}$/;

export type StoredApiKeyHash = {
  apiId: number;
  keyHash: string;
  revokedAt: Date | null;
};

export function generateApiKey() {
  const random = randomBytes(API_KEY_RANDOM_BYTES).toString("base64url");

  if (random.length !== API_KEY_RANDOM_LENGTH) {
    throw new Error("API key entropy was not the expected length.");
  }

  const secret = `${API_KEY_PREFIX}${random}`;

  return {
    secret,
    keyPrefix: secret.slice(0, API_KEY_PREFIX.length + API_KEY_PREFIX_RANDOM_LENGTH),
    keyHash: hashApiKey(secret),
  };
}

export function hashApiKey(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function readApiKeyName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return normalizeApiName(value);
}

export function readRouteId(value: string) {
  if (!/^[1-9][0-9]{0,9}$/.test(value)) {
    return null;
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id) || id < 1 || id > MYSQL_SIGNED_INT_MAX) {
    return null;
  }

  return id;
}

export function readBearerApiKey(header: string | null) {
  if (header == null || header.trim() === "") {
    return { ok: false as const, reason: "missing" as const };
  }

  const match = /^Bearer ([A-Za-z0-9_-]{1,200})$/i.exec(header);

  if (!match || !SECRET_PATTERN.test(match[1])) {
    return { ok: false as const, reason: "malformed" as const };
  }

  return { ok: true as const, secret: match[1] };
}

export function presentedKeyIsUsable(
  presentedHash: string,
  requestedApiId: number,
  stored: StoredApiKeyHash | null,
) {
  const presented = HASH_PATTERN.test(presentedHash)
    ? Buffer.from(presentedHash, "hex")
    : Buffer.alloc(32, 1);
  const storedHash =
    stored && HASH_PATTERN.test(stored.keyHash)
      ? Buffer.from(stored.keyHash, "hex")
      : Buffer.alloc(32);
  const hashesMatch =
    presented.length === storedHash.length &&
    timingSafeEqual(presented, storedHash);

  return Boolean(
    stored &&
      hashesMatch &&
      stored.apiId === requestedApiId &&
      stored.revokedAt == null,
  );
}
