import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../connect.js", import.meta.url), "utf8");
const ORIGIN = "https://connect-pilot.vercel.app";
const TOKEN = (name) => `eyJhbGciOiJIUzI1NiJ9.${name}payloadpayload.signaturesignature`;

/** Runs connect.js against a fake page window and chrome.storage. */
function load({ failStorage = false } = {}) {
  const listeners = [];
  const posted = [];
  const stored = {};
  const window = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => type === "message" && listeners.push(fn),
    postMessage: (data, targetOrigin) => posted.push({ data, targetOrigin }),
  };
  const chrome = {
    storage: {
      local: {
        set: async (items) => {
          if (failStorage) throw new Error("quota");
          Object.assign(stored, items);
        },
      },
    },
  };
  vm.runInNewContext(SOURCE, { window, chrome });

  const dispatch = async (data, { source = window, origin = ORIGIN } = {}) => {
    for (const fn of listeners) await fn({ data, source, origin });
  };
  const types = () => posted.map((p) => p.data.type);
  return { window, posted, stored, dispatch, types };
}

describe("connect.js", () => {
  it("announces itself to the page on load, targeting the page origin only", () => {
    const page = load();

    // Objects from the vm sandbox have a different prototype; compare by value.
    assert.deepEqual(JSON.parse(JSON.stringify(page.posted)), [
      { data: { type: "CONNECTPILOT_EXTENSION_READY" }, targetOrigin: ORIGIN },
    ]);
  });

  it("answers a ping so the page can detect the extension at any time", async () => {
    const page = load();

    await page.dispatch({ type: "CONNECTPILOT_EXTENSION_PING" });

    assert.deepEqual(page.types(), ["CONNECTPILOT_EXTENSION_READY", "CONNECTPILOT_EXTENSION_READY"]);
  });

  it("stores valid tokens posted by the page and confirms", async () => {
    const page = load();

    await page.dispatch({ type: "CONNECTPILOT_EXTENSION_TOKENS", access: TOKEN("a"), refresh: TOKEN("r") });

    assert.deepEqual(page.stored, { access_token: TOKEN("a"), refresh_token: TOKEN("r") });
    assert.equal(page.types().at(-1), "CONNECTPILOT_EXTENSION_CONNECTED");
    assert.equal(page.posted.at(-1).targetOrigin, ORIGIN);
  });

  it("ignores messages from other frames or windows", async () => {
    const page = load();

    await page.dispatch(
      { type: "CONNECTPILOT_EXTENSION_TOKENS", access: TOKEN("a"), refresh: TOKEN("r") },
      { source: { other: "frame" } }
    );

    assert.deepEqual(page.stored, {});
    assert.deepEqual(page.types(), ["CONNECTPILOT_EXTENSION_READY"]);
  });

  it("ignores messages from another origin", async () => {
    const page = load();

    await page.dispatch(
      { type: "CONNECTPILOT_EXTENSION_TOKENS", access: TOKEN("a"), refresh: TOKEN("r") },
      { origin: "https://evil.example" }
    );

    assert.deepEqual(page.stored, {});
  });

  it("rejects values that are not JWTs", async () => {
    const page = load();

    await page.dispatch({ type: "CONNECTPILOT_EXTENSION_TOKENS", access: "not a token", refresh: TOKEN("r") });
    await page.dispatch({ type: "CONNECTPILOT_EXTENSION_TOKENS", access: TOKEN("a"), refresh: { evil: true } });

    assert.deepEqual(page.stored, {});
    assert.deepEqual(page.types().slice(1), ["CONNECTPILOT_EXTENSION_ERROR", "CONNECTPILOT_EXTENSION_ERROR"]);
  });

  it("ignores unrelated page messages", async () => {
    const page = load();

    await page.dispatch({ type: "SOMETHING_ELSE", access: TOKEN("a"), refresh: TOKEN("r") });
    await page.dispatch("plain string");
    await page.dispatch(null);

    assert.deepEqual(page.stored, {});
    assert.deepEqual(page.types(), ["CONNECTPILOT_EXTENSION_READY"]);
  });

  it("reports a storage failure to the page", async () => {
    const page = load({ failStorage: true });

    await page.dispatch({ type: "CONNECTPILOT_EXTENSION_TOKENS", access: TOKEN("a"), refresh: TOKEN("r") });

    assert.equal(page.types().at(-1), "CONNECTPILOT_EXTENSION_ERROR");
  });
});
