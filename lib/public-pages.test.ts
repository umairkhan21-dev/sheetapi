import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pages = {
  home: "app/page.tsx",
  privacy: "app/privacy/page.tsx",
  terms: "app/terms/page.tsx",
  docs: "app/docs/page.tsx",
  chrome: "app/site-chrome.tsx",
} as const;

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("public pages", () => {
  it("links the homepage documentation CTA and footer to the public pages", () => {
    const home = source(pages.home);
    const chrome = source(pages.chrome);

    assert.match(home, /href="\/docs"/);
    assert.equal(home.includes("<button"), false);
    assert.match(chrome, /href="\/docs"/);
    assert.match(chrome, /href="\/privacy"/);
    assert.match(chrome, /href="\/terms"/);
    assert.match(home, /SiteFooter/);
  });

  it("publishes privacy, terms, and docs with titles", () => {
    for (const path of [pages.privacy, pages.terms, pages.docs]) {
      const page = source(path);
      assert.match(page, /export const metadata/);
      assert.match(page, /title:/);
      assert.match(page, /description:/);
    }
  });

  it("documents the implemented public route, auth header, and limits", () => {
    const docs = source(pages.docs);

    assert.match(docs, /\/api\/v1\/\{slug\}/);
    assert.match(docs, /Authorization: Bearer/);
    assert.match(docs, /sk_live_example_not_a_real_key/);
    assert.match(docs, /GET, POST, PUT,\s+PATCH, DELETE, and OPTIONS/);
    assert.match(docs, /120 requests per minute/);
    assert.match(docs, /10,000 data rows/);
    assert.match(docs, /WORKSHEET_TOO_LARGE/);
    assert.match(docs, /INVALID_API_KEY/);
    assert.equal(docs.includes("api.sheetapi.dev"), false);
    assert.equal(docs.includes("sk_live_" + "a".repeat(43)), false);
  });

  it("does not invent a company address or contact email", () => {
    const combined = [pages.privacy, pages.terms, pages.docs]
      .map(source)
      .join("\n");

    assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(combined), false);
    assert.match(combined, /has not published a company name/);
    assert.match(combined, /Needs owner or legal review/);
  });
});
