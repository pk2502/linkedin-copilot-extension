// Manifest for the Chrome Web Store build: identical to manifest.json minus
// localhost entries, which exist only for local development and draw
// reviewer questions.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const isLocal = (pattern) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(pattern);

export function storeManifest(manifest) {
  const result = structuredClone(manifest);
  result.host_permissions = (result.host_permissions ?? []).filter((p) => !isLocal(p));
  result.content_scripts = (result.content_scripts ?? [])
    .map((script) => ({ ...script, matches: script.matches.filter((p) => !isLocal(p)) }))
    .filter((script) => script.matches.length > 0);
  return result;
}

// CLI: node scripts/store-manifest.mjs <input manifest> <output manifest>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  const manifest = JSON.parse(readFileSync(input, "utf8"));
  writeFileSync(output, JSON.stringify(storeManifest(manifest), null, 2) + "\n");
}
