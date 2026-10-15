import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPublicApiUrl,
  isApiSlug,
  normalizeApiName,
  normalizeApiSlug,
  readApiUpdate,
} from "./api-config";

describe("API name and slug normalization", () => {
  it("trims and collapses an API name", () => {
    assert.equal(normalizeApiName("  Products   API "), "Products API");
  });

  it("rejects a blank or oversized API name", () => {
    assert.equal(normalizeApiName("   "), null);
    assert.equal(normalizeApiName("a".repeat(81)), null);
    assert.equal(normalizeApiName("bad\nname"), null);
  });

  it("builds a URL slug from a name", () => {
    assert.equal(normalizeApiSlug("Products API"), "products-api");
    assert.equal(normalizeApiSlug("my_products"), "my-products");
    assert.equal(normalizeApiSlug("Éclair Menu"), "eclair-menu");
  });

  it("rejects slugs that are not URL-safe", () => {
    assert.equal(normalizeApiSlug("!!!"), null);
    assert.equal(normalizeApiSlug("a".repeat(65)), null);
    assert.equal(isApiSlug("Products"), false);
    assert.equal(isApiSlug("products"), true);
  });

  it("builds the public endpoint from the app URL", () => {
    assert.equal(
      buildPublicApiUrl("http://localhost:3000/", "products"),
      "http://localhost:3000/api/v1/products",
    );
  });

  it("reads a display-name or status change and ignores other fields", () => {
    assert.deepEqual(readApiUpdate({ name: "  Products   API " }), {
      ok: true,
      changes: { name: "Products API" },
    });
    assert.deepEqual(readApiUpdate({ status: "DISABLED" }), {
      ok: true,
      changes: { status: "DISABLED" },
    });
    assert.deepEqual(
      readApiUpdate({
        name: "Renamed",
        status: "ACTIVE",
        slug: "changed",
        spreadsheetId: "other-sheet",
        worksheetId: 9,
      }),
      {
        ok: true,
        changes: { name: "Renamed", status: "ACTIVE" },
      },
    );
    assert.equal(readApiUpdate({ slug: "changed" }).ok, false);
    assert.equal(readApiUpdate({ status: "active" }).ok, false);
    assert.equal(readApiUpdate({ name: "   " }).ok, false);
    assert.equal(readApiUpdate({ name: 12 }).ok, false);
    assert.equal(readApiUpdate([]).ok, false);
    assert.equal(readApiUpdate(null).ok, false);
  });
});
