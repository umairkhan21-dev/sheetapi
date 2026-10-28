import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const KEY_BYTES = 32;
const IV_BYTES = 12;

let cachedKey: Buffer | null | undefined;

/**
 * Authenticated encryption (AES-256-GCM) for Google OAuth tokens at rest.
 * Uses TOKEN_ENCRYPTION_KEY (32-byte key as 64 hex chars or base64/base64url).
 * Legacy plaintext rows remain readable until rewritten on the next token update.
 */
export function sealSecret(plaintext: string): string {
  if (plaintext.length === 0) {
    throw new Error("Cannot seal an empty secret");
  }

  const key = requireTokenEncryptionKey();

  if (!key) {
    return plaintext;
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "enc",
    "v1",
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(":");
}

export function openSecret(stored: string): string {
  if (!isSealedSecret(stored)) {
    return stored;
  }

  const key = requireTokenEncryptionKey();

  if (!key) {
    throw new Error("Encrypted token present but TOKEN_ENCRYPTION_KEY is not set");
  }

  const { iv, ciphertext, tag } = parseSealed(stored);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function isSealedSecret(stored: string) {
  return stored.startsWith(PREFIX);
}

export function sealSecretIfNeeded(plaintext: string | null): string | null {
  if (plaintext == null) {
    return null;
  }

  return sealSecret(plaintext);
}

export function openSecretIfPresent(stored: string | null): string | null {
  if (stored == null) {
    return null;
  }

  return openSecret(stored);
}

export function assertTokenEncryptionConfiguredForProduction() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  requireTokenEncryptionKey(true);
}

export function isTokenEncryptionEnabled() {
  return requireTokenEncryptionKey() != null;
}

function requireTokenEncryptionKey(force = false): Buffer | null {
  if (cachedKey !== undefined && !force) {
    return cachedKey;
  }

  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();

  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TOKEN_ENCRYPTION_KEY is required in production");
    }

    cachedKey = null;
    return null;
  }

  const key = parseKeyMaterial(raw);

  if (key.length !== KEY_BYTES) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  }

  cachedKey = key;
  return key;
}

function parseSealed(stored: string): {
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
} {
  const parts = stored.split(":");

  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("Stored secret has an invalid envelope");
  }

  const iv = Buffer.from(parts[2] ?? "", "base64url");
  const ciphertext = Buffer.from(parts[3] ?? "", "base64url");
  const tag = Buffer.from(parts[4] ?? "", "base64url");

  if (
    iv.length !== IV_BYTES ||
    ciphertext.length === 0 ||
    tag.length !== 16
  ) {
    throw new Error("Stored secret has an invalid envelope");
  }

  return { iv, ciphertext, tag };
}

function parseKeyMaterial(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  try {
    const base64url = Buffer.from(raw, "base64url");

    if (base64url.length === KEY_BYTES) {
      return base64url;
    }
  } catch {
    // fall through
  }

  const base64 = Buffer.from(raw, "base64");

  if (base64.length === KEY_BYTES) {
    return base64;
  }

  throw new Error(
    "TOKEN_ENCRYPTION_KEY must be 64 hex characters or 32-byte base64",
  );
}

/** Test helper: clear cached key between cases. */
export function resetTokenEncryptionKeyCacheForTests() {
  cachedKey = undefined;
}
