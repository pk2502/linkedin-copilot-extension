import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Only the chunks needed to display an icon. Tools on the way to the repo can
// embed extra metadata chunks (e.g. C2PA "caBX"), which bloat the package.
const ALLOWED = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);

function chunkTypes(file) {
  const data = readFileSync(new URL(`../${file}`, import.meta.url));
  assert.equal(data.subarray(1, 4).toString("latin1"), "PNG", `${file} is not a PNG`);
  const types = [];
  for (let offset = 8; offset < data.length; ) {
    const length = data.readUInt32BE(offset);
    types.push(data.subarray(offset + 4, offset + 8).toString("latin1"));
    offset += 12 + length;
  }
  return types;
}

describe("icons", () => {
  for (const file of ["icon16.png", "icon48.png", "icon128.png"]) {
    it(`${file} contains no metadata chunks`, () => {
      const extra = chunkTypes(file).filter((type) => !ALLOWED.has(type));
      assert.deepEqual(extra, []);
    });
  }
});
