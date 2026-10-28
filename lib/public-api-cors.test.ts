import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PUBLIC_CORS_HEADERS,
  PUBLIC_RESPONSE_HEADERS,
  publicCorsPreflightResponse,
} from "./public-api-cors";

describe("public API CORS", () => {
  it("answers OPTIONS preflight with required Access-Control headers", () => {
    const response = publicCorsPreflightResponse();
    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      PUBLIC_CORS_HEADERS["Access-Control-Allow-Origin"],
    );
    assert.equal(
      response.headers.get("Access-Control-Allow-Methods"),
      PUBLIC_CORS_HEADERS["Access-Control-Allow-Methods"],
    );
    assert.equal(
      response.headers.get("Access-Control-Allow-Headers"),
      PUBLIC_CORS_HEADERS["Access-Control-Allow-Headers"],
    );
    assert.match(
      response.headers.get("Access-Control-Allow-Headers") ?? "",
      /Authorization/i,
    );
    assert.match(
      response.headers.get("Access-Control-Allow-Headers") ?? "",
      /Content-Type/i,
    );
  });

  it("keeps CORS headers on the shared public response header set", () => {
    assert.equal(PUBLIC_RESPONSE_HEADERS["Access-Control-Allow-Origin"], "*");
    assert.equal(
      PUBLIC_RESPONSE_HEADERS["Access-Control-Allow-Methods"],
      PUBLIC_CORS_HEADERS["Access-Control-Allow-Methods"],
    );
    assert.equal(
      PUBLIC_RESPONSE_HEADERS["Access-Control-Allow-Headers"],
      PUBLIC_CORS_HEADERS["Access-Control-Allow-Headers"],
    );
    assert.match(
      PUBLIC_RESPONSE_HEADERS["Access-Control-Allow-Headers"],
      /Authorization/i,
    );
    assert.match(
      PUBLIC_RESPONSE_HEADERS["Access-Control-Allow-Headers"],
      /Content-Type/i,
    );
  });
});
