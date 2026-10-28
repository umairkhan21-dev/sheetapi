import { API_CELL_LENGTH } from "@/lib/google-worksheets";
import {
  parsePublicJsonObject,
  PUBLIC_ROW_NUMBER_PARAM,
  readPublicRowNumber,
} from "@/lib/public-api-write";

const PAGINATION_PARAMETERS = new Set(["limit", "offset"]);

export const PLAYGROUND_MISSING_KEY_MESSAGE =
  "Create a key in API keys above and copy it when it is shown. This playground can use that key until you leave this page. Existing keys cannot be shown again.";

export const PLAYGROUND_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type PlaygroundMethod = (typeof PLAYGROUND_METHODS)[number];

/** All five methods are implemented on `/api/v1/{slug}`. */
export const PLAYGROUND_SUPPORTED_METHODS: readonly PlaygroundMethod[] =
  PLAYGROUND_METHODS;

export const PLAYGROUND_DEFAULT_METHOD: PlaygroundMethod = "GET";

export const PLAYGROUND_DESCRIPTION =
  "Test your API connection directly from your browser. Select an HTTP method, modify the request if needed, and click Run to see the response.";

export const PLAYGROUND_SELECTOR_LABEL = "Row ID or Filter (Optional)";

export const PLAYGROUND_SELECTOR_HELP =
  "Optional. For GET, use column/value (for example city/london). For PUT, PATCH, and DELETE, use row/N where N is the Google Sheets row number (data rows start at 2; row 1 is the header). Leave blank to read all rows on GET, or to append on POST. Do not assume the first column is an id.";

export const PLAYGROUND_DOCS_LABEL = "View API documentation";

export const PLAYGROUND_DELETE_CONFIRM_MESSAGE =
  "I understand this deletes one worksheet row and cannot be undone from here.";

export const PLAYGROUND_DEFAULT_BODY = `{
  "id": "7",
  "name": "luna",
  "city": "paris"
}`;

export function readPlaygroundMethod(value: string): PlaygroundMethod | null {
  return PLAYGROUND_METHODS.find((method) => method === value) ?? null;
}

export function isPlaygroundMethodSupported(method: PlaygroundMethod) {
  return PLAYGROUND_SUPPORTED_METHODS.includes(method);
}

export function playgroundMethodUsesBody(method: PlaygroundMethod) {
  return method === "POST" || method === "PUT" || method === "PATCH";
}

export function playgroundMethodUsesRowSelector(method: PlaygroundMethod) {
  return method === "PUT" || method === "PATCH" || method === "DELETE";
}

export function playgroundMethodUsesFilterSelector(method: PlaygroundMethod) {
  return method === "GET";
}

export type PlaygroundSelector =
  | { kind: "empty" }
  | { kind: "filter"; column: string; value: string }
  | { kind: "row"; rowNumber: number };

export function parsePlaygroundSelector(
  raw: string,
): { ok: true; selector: PlaygroundSelector } | { ok: false; message: string } {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: true, selector: { kind: "empty" } };
  }

  if (trimmed.length > API_CELL_LENGTH * 2) {
    return {
      ok: false,
      message: "That selector is too long.",
    };
  }

  const rowMatch = /^row\/(\d+)$/i.exec(trimmed);

  if (rowMatch) {
    const params = new URLSearchParams();
    params.set(PUBLIC_ROW_NUMBER_PARAM, rowMatch[1] ?? "");
    const parsed = readPublicRowNumber(params);

    if (!parsed.ok) {
      return parsed;
    }

    return {
      ok: true,
      selector: { kind: "row", rowNumber: parsed.rowNumber },
    };
  }

  const slash = trimmed.indexOf("/");

  if (slash <= 0 || slash === trimmed.length - 1) {
    return {
      ok: false,
      message:
        "Use column/value for a GET filter (for example city/london), or row/N for PUT, PATCH, and DELETE.",
    };
  }

  const column = trimmed.slice(0, slash);
  const value = trimmed.slice(slash + 1);

  if (column.length === 0) {
    return {
      ok: false,
      message: "Enter a column name before the / in column/value.",
    };
  }

  if (column.length > API_CELL_LENGTH) {
    return { ok: false, message: "A filter name is too long." };
  }

  if (PAGINATION_PARAMETERS.has(column)) {
    return {
      ok: false,
      message:
        "limit and offset are not column filters. Leave the selector blank to use the API defaults, or filter with another column.",
    };
  }

  if (value.length === 0) {
    return {
      ok: false,
      message: `${column} must not be empty.`,
    };
  }

  if (column.toLowerCase() === "row") {
    return {
      ok: false,
      message:
        "Use row/N with a worksheet row number for PUT, PATCH, and DELETE. Data rows start at 2.",
    };
  }

  return {
    ok: true,
    selector: { kind: "filter", column, value },
  };
}

export type PlaygroundRequestInput = {
  endpoint: string;
  method: PlaygroundMethod;
  selector: string;
  body: string;
  deleteConfirmed: boolean;
};

export type PlaygroundBuiltRequest = {
  url: string;
  method: PlaygroundMethod;
  headers: Record<string, string>;
  body?: string;
};

export function buildPlaygroundRequest(
  input: PlaygroundRequestInput,
): { ok: true; request: PlaygroundBuiltRequest } | { ok: false; message: string } {
  if (!isPlaygroundMethodSupported(input.method)) {
    return {
      ok: false,
      message: `${input.method} is not supported yet.`,
    };
  }

  let endpoint: URL;

  try {
    endpoint = new URL(input.endpoint);
  } catch {
    return { ok: false, message: "This API endpoint is not a valid URL." };
  }

  if (endpoint.search.length > 0 || endpoint.username || endpoint.password) {
    return {
      ok: false,
      message: "The endpoint URL must not include a query or credentials.",
    };
  }

  const baseUrl = `${endpoint.origin}${endpoint.pathname}`;
  const selector = parsePlaygroundSelector(input.selector);

  if (!selector.ok) {
    return selector;
  }

  if (input.method === "GET") {
    if (selector.selector.kind === "row") {
      return {
        ok: false,
        message:
          "GET does not load a single row by number. Use column/value to filter, or leave blank to read all rows.",
      };
    }

    const params = new URLSearchParams();

    if (selector.selector.kind === "filter") {
      params.set(selector.selector.column, selector.selector.value);
    }

    const query = params.toString();

    return {
      ok: true,
      request: {
        url: query.length > 0 ? `${baseUrl}?${query}` : baseUrl,
        method: "GET",
        headers: {},
      },
    };
  }

  if (input.method === "POST") {
    if (selector.selector.kind !== "empty") {
      return {
        ok: false,
        message:
          "POST appends a new row and does not use a row or filter selector. Leave that field blank.",
      };
    }

    const body = validatePlaygroundBody(input.body);

    if (!body.ok) {
      return body;
    }

    return {
      ok: true,
      request: {
        url: baseUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: body.text,
      },
    };
  }

  if (selector.selector.kind === "filter") {
    return {
      ok: false,
      message:
        "Use row/N to select a worksheet row for PUT, PATCH, and DELETE. Filtering is only for GET.",
    };
  }

  if (selector.selector.kind === "empty") {
    return {
      ok: false,
      message:
        "Enter row/N for this request. N is the Google Sheets row number; data rows start at 2.",
    };
  }

  const url = `${baseUrl}?${PUBLIC_ROW_NUMBER_PARAM}=${encodeURIComponent(String(selector.selector.rowNumber))}`;

  if (input.method === "DELETE") {
    if (!input.deleteConfirmed) {
      return {
        ok: false,
        message: "Confirm deletion before sending a DELETE request.",
      };
    }

    return {
      ok: true,
      request: {
        url,
        method: "DELETE",
        headers: {},
      },
    };
  }

  const body = validatePlaygroundBody(input.body);

  if (!body.ok) {
    return body;
  }

  return {
    ok: true,
    request: {
      url,
      method: input.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body.text,
    },
  };
}

function validatePlaygroundBody(
  text: string,
): { ok: true; text: string } | { ok: false; message: string } {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return {
      ok: false,
      message: "Enter a JSON object for the request body.",
    };
  }

  const parsed = parsePublicJsonObject(trimmed);

  if (!parsed.ok) {
    return parsed;
  }

  const keys = Object.keys(parsed.body);

  if (keys.length === 0) {
    return {
      ok: false,
      message: "The request body must include at least one field.",
    };
  }

  for (const key of keys) {
    const value = parsed.body[key];

    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      return {
        ok: false,
        message: `${key} must be a string, number, or boolean.`,
      };
    }

    if (value === null) {
      return {
        ok: false,
        message: `${key} must be a string, number, or boolean.`,
      };
    }

    if (typeof value === "number" && !Number.isFinite(value)) {
      return {
        ok: false,
        message: `${key} must be a string, number, or boolean.`,
      };
    }

    if (typeof value === "string" && value.length > API_CELL_LENGTH) {
      return {
        ok: false,
        message: `${key} exceeds the ${API_CELL_LENGTH} character limit.`,
      };
    }
  }

  return { ok: true, text: trimmed };
}

export function playgroundAuthorization(
  secret: string | null | undefined,
): { ok: true; authorization: string } | { ok: false; message: string } {
  if (
    typeof secret !== "string" ||
    secret.trim().length === 0 ||
    /[\r\n]/.test(secret)
  ) {
    return { ok: false, message: PLAYGROUND_MISSING_KEY_MESSAGE };
  }

  return { ok: true, authorization: `Bearer ${secret}` };
}

export function readPlaygroundError(body: unknown, ok: boolean) {
  if (ok) {
    return null;
  }

  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
    const message = body.error.message.trim();

    if (message.length > 0) {
      return message;
    }
  }

  return "The request failed.";
}

export function formatPlaygroundBody(body: unknown) {
  return JSON.stringify(body, null, 2);
}

export function redactPlaygroundSecret(text: string, secret: string) {
  if (secret.length === 0 || !text.includes(secret)) {
    return text;
  }

  return text.split(secret).join("[redacted]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
