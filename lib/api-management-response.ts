export function managementJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function managementError(
  code: "UNAUTHORIZED" | "INVALID_INPUT" | "NOT_FOUND" | "INTERNAL_ERROR",
  message: string,
  status: number,
) {
  return managementJson(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    status,
  );
}
