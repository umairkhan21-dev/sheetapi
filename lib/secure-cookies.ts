/**
 * Cookie Secure flag policy.
 * Production always sets Secure and rejects any override that would allow
 * cleartext cookie transmission.
 */
export function cookiesMustUseSecureFlag(): boolean {
  if (process.env.NODE_ENV === "production") {
    const insecureOverride = process.env.ALLOW_INSECURE_COOKIES?.trim();

    if (insecureOverride === "true" || insecureOverride === "1") {
      throw new Error(
        "ALLOW_INSECURE_COOKIES cannot be enabled when NODE_ENV=production",
      );
    }

    return true;
  }

  return false;
}
