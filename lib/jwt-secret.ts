const JWT_SECRET_MIN_PRODUCTION = 32;
const JWT_SECRET_MIN_DEVELOPMENT = 16;
const WEAK_JWT_SECRETS = new Set([
  "secret",
  "password",
  "changeme",
  "jwt_secret",
  "jwtsecret",
  "development",
  "dev",
  "test",
  "example",
]);

let cachedJwtSecret: string | undefined;

export function getJwtSecret() {
  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }

  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  assertJwtSecretStrength(secret);
  cachedJwtSecret = secret;
  return secret;
}

export function assertJwtSecretStrength(secret: string) {
  const production = process.env.NODE_ENV === "production";
  const minimum = production
    ? JWT_SECRET_MIN_PRODUCTION
    : JWT_SECRET_MIN_DEVELOPMENT;

  if (secret.length < minimum) {
    throw new Error(
      production
        ? `JWT_SECRET must be at least ${JWT_SECRET_MIN_PRODUCTION} characters in production`
        : `JWT_SECRET must be at least ${JWT_SECRET_MIN_DEVELOPMENT} characters`,
    );
  }

  if (WEAK_JWT_SECRETS.has(secret.toLowerCase())) {
    throw new Error("JWT_SECRET is too weak");
  }

  const uniqueChars = new Set(secret).size;

  if (production && uniqueChars < 10) {
    throw new Error("JWT_SECRET does not have enough entropy for production");
  }

  if (!production && secret.length < JWT_SECRET_MIN_PRODUCTION) {
    console.warn(
      `JWT_SECRET should be at least ${JWT_SECRET_MIN_PRODUCTION} characters before production deploy`,
    );
  }
}

/** Test helper: clear cached JWT secret between cases. */
export function resetJwtSecretCacheForTests() {
  cachedJwtSecret = undefined;
}
