import { API_DATA_ROW_LIMIT } from "@/lib/google-worksheets";

// The public read already rejects worksheets above this many data rows.
// Using it as both the default and the maximum keeps an unpaged request
// compatible with that ceiling.
export const PUBLIC_API_LIMIT_DEFAULT = API_DATA_ROW_LIMIT;
export const PUBLIC_API_LIMIT_MAX = API_DATA_ROW_LIMIT;
export const PUBLIC_API_OFFSET_MAX = Number.MAX_SAFE_INTEGER;

const WHOLE_NUMBER = /^\d+$/;
const MAX_QUERY_DIGITS = 128;

export type PublicApiPage = {
  offset: number;
  limit: number;
};

export function publicApiLimitMessage() {
  return `limit must be a whole number from 1 to ${PUBLIC_API_LIMIT_MAX}.`;
}

export function publicApiOffsetMessage() {
  return `offset must be a whole number from 0 to ${PUBLIC_API_OFFSET_MAX}.`;
}

export function readPublicPagination(
  searchParams: URLSearchParams,
): { ok: true; page: PublicApiPage } | { ok: false; message: string } {
  const limit = readQueryInteger(searchParams, "limit");

  if (
    !limit.ok ||
    (limit.value != null &&
      (limit.value < 1 || limit.value > PUBLIC_API_LIMIT_MAX))
  ) {
    return { ok: false, message: publicApiLimitMessage() };
  }

  const offset = readQueryInteger(searchParams, "offset");

  if (
    !offset.ok ||
    (offset.value != null && offset.value > PUBLIC_API_OFFSET_MAX)
  ) {
    return { ok: false, message: publicApiOffsetMessage() };
  }

  return {
    ok: true,
    page: {
      offset: offset.value ?? 0,
      limit: limit.value ?? PUBLIC_API_LIMIT_DEFAULT,
    },
  };
}

// Data rows only. The header row is removed before this runs.
export function pageWorksheetRows<T>(rows: readonly T[], page: PublicApiPage) {
  return rows.slice(page.offset, page.offset + page.limit);
}

function readQueryInteger(
  searchParams: URLSearchParams,
  name: string,
): { ok: true; value: number | null } | { ok: false } {
  const values = searchParams.getAll(name);

  if (values.length === 0) {
    return { ok: true, value: null };
  }

  if (values.length !== 1) {
    return { ok: false };
  }

  const value = parseWholeNumber(values[0] ?? "");

  if (value == null) {
    return { ok: false };
  }

  return { ok: true, value };
}

function parseWholeNumber(raw: string) {
  if (raw.length === 0 || raw.length > MAX_QUERY_DIGITS || !WHOLE_NUMBER.test(raw)) {
    return null;
  }

  const normalized = raw.replace(/^0+/, "") || "0";

  if (normalized.length > 16) {
    return null;
  }

  const parsed = BigInt(normalized);

  if (parsed > BigInt(PUBLIC_API_OFFSET_MAX)) {
    return null;
  }

  return Number(parsed);
}
