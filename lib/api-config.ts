const MAX_NAME_INPUT_LENGTH = 200;
const MAX_SLUG_INPUT_LENGTH = 80;
export const MAX_API_NAME_LENGTH = 80;
export const MAX_API_SLUG_LENGTH = 64;

const API_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeApiName(value: string) {
  if (value.length > MAX_NAME_INPUT_LENGTH) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length < 1 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return null;
  }

  const name = trimmed.replace(/ +/g, " ");

  if (name.length > MAX_API_NAME_LENGTH) {
    return null;
  }

  return name;
}

export function normalizeApiSlug(value: string) {
  if (value.length > MAX_SLUG_INPUT_LENGTH) {
    return null;
  }

  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!isApiSlug(slug)) {
    return null;
  }

  return slug;
}

export function isApiSlug(value: string) {
  return (
    value.length > 0 &&
    value.length <= MAX_API_SLUG_LENGTH &&
    API_SLUG_PATTERN.test(value)
  );
}

export function buildPublicApiUrl(appUrl: string, slug: string) {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/api/v1/${slug}`;
}

export type ApiStatusValue = "ACTIVE" | "DISABLED";

export type ApiUpdateChanges = {
  name?: string;
  status?: ApiStatusValue;
};

export function readApiUpdate(
  value: unknown,
): { ok: true; changes: ApiUpdateChanges } | { ok: false; message: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      message: "Enter a new name or choose Active or Disabled.",
    };
  }

  const record = value as Record<string, unknown>;
  const hasName = Object.prototype.hasOwnProperty.call(record, "name");
  const hasStatus = Object.prototype.hasOwnProperty.call(record, "status");

  if (!hasName && !hasStatus) {
    return {
      ok: false,
      message: "Enter a new name or choose Active or Disabled.",
    };
  }

  const changes: ApiUpdateChanges = {};

  if (hasName) {
    if (typeof record.name !== "string") {
      return {
        ok: false,
        message: "Enter an API name up to 80 characters.",
      };
    }

    const name = normalizeApiName(record.name);

    if (!name) {
      return {
        ok: false,
        message: "Enter an API name up to 80 characters.",
      };
    }

    changes.name = name;
  }

  if (hasStatus) {
    if (record.status !== "ACTIVE" && record.status !== "DISABLED") {
      return {
        ok: false,
        message: "Choose Active or Disabled.",
      };
    }

    changes.status = record.status;
  }

  return { ok: true, changes };
}
