import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { storeManifest } from "../scripts/store-manifest.mjs";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

describe("store manifest", () => {
  const store = storeManifest(manifest);
  const all = JSON.stringify(store);

  it("contains no localhost hosts", () => {
    assert.doesNotMatch(all, /localhost|127\.0\.0\.1/);
  });

  it("keeps the production API and connect page", () => {
    assert.deepEqual(store.host_permissions, ["https://connectpilot-api.onrender.com/*"]);
    assert.deepEqual(store.content_scripts[0].matches, ["https://connect-pilot.vercel.app/connect-extension*"]);
  });

  it("changes nothing else", () => {
    const { host_permissions: _a, content_scripts: _b, ...rest } = store;
    const { host_permissions: _c, content_scripts: _d, ...original } = manifest;
    assert.deepEqual(rest, original);
    assert.equal(store.content_scripts[0].js[0], "connect.js");
  });

  it("does not modify the input", () => {
    assert.ok(manifest.host_permissions.some((p) => p.includes("localhost")));
  });
});
