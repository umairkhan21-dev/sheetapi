export const PUBLIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export const PUBLIC_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  ...PUBLIC_CORS_HEADERS,
} as const;

export function publicCorsPreflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      ...PUBLIC_CORS_HEADERS,
      "Cache-Control": "no-store",
    },
  });
}
