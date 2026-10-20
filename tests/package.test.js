import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Every module the extension loads at runtime, following imports from the
// entry points named in popup.html and manifest.json.
function runtimeModules() {
  const manifest = JSON.parse(read("manifest.json"));
  const entries = ["popup.js", ...manifest.content_scripts.flatMap((s) => s.js)];
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, dep] of read(file).matchAll(/from\s+"\.\/([^"]+)"/g)) visit(dep);
  };
  entries.forEach(visit);
  return seen;
}

describe("package script", () => {
  it("ships every runtime module and asset", () => {
    const line = read("scripts/package.sh").match(/^FILES="([^"]+)"/m)[1];
    const packaged = new Set(line.split(/\s+/));
    for (const file of [...runtimeModules(), "popup.html", "styles.css"]) {
      assert.ok(packaged.has(file), `${file} is missing from FILES in scripts/package.sh`);
    }
    for (const size of [16, 48, 128]) assert.ok(packaged.has(`icon${size}.png`));
  });
});
