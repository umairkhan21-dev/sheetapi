import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withConnectedAccountLock } from "./connected-account-test-lock";

describe("connected account test lock", () => {
  it("runs overlapping sections one at a time", async () => {
    let active = 0;
    let maxActive = 0;

    await Promise.all(
      [0, 1, 2, 3].map(() =>
        withConnectedAccountLock(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 30));
          active -= 1;
        }),
      ),
    );

    assert.equal(maxActive, 1);
    assert.equal(active, 0);
  });
});
