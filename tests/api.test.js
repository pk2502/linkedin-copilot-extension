import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { ApiError, SessionExpiredError, createApi, errorMessage } from "../api.js";

const API = "https://api.test";

/** In-memory stand-in for chrome.storage.local (promise API). */
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, data[k]]));
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
    },
  };
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** fetch stub that replies by URL and records every call. */
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init, auth: init.headers?.Authorization, body: init.body && JSON.parse(init.body) });
    return handler(url, init, calls.length);
  };
  fn.calls = calls;
  return fn;
}

const GENERATE_URL = `${API}/api/generate/connection-request/`;
const REFRESH_URL = `${API}/api/auth/refresh/`;
const payload = { name: "Priya", company: "Acme", role: "EM", tone: "formal" };

let storage;
beforeEach(() => {
  storage = memoryStorage({ access_token: "access-1", refresh_token: "refresh-1" });
});

describe("generate", () => {
  it("sends the bearer token and returns the message", async () => {
    const fetchImpl = fakeFetch(() => json(200, { message: "Hi Priya" }));
    const api = createApi({ storage, fetchImpl, apiBase: API });

    const data = await api.generate("connection-request", payload);

    assert.deepEqual(data, { message: "Hi Priya" });
    assert.equal(fetchImpl.calls[0].url, GENERATE_URL);
    assert.equal(fetchImpl.calls[0].auth, "Bearer access-1");
    assert.deepEqual(fetchImpl.calls[0].body, payload);
  });

  it("refreshes an expired access token and retries once", async () => {
    const fetchImpl = fakeFetch((url, init) => {
      if (url === REFRESH_URL) return json(200, { access: "access-2", refresh: "refresh-2" });
      return init.headers.Authorization === "Bearer access-2" ? json(200, { message: "ok" }) : json(401, {});
    });
    const api = createApi({ storage, fetchImpl, apiBase: API });

    assert.deepEqual(await api.generate("connection-request", payload), { message: "ok" });
    assert.deepEqual(
      fetchImpl.calls.map((c) => c.url),
      [GENERATE_URL, REFRESH_URL, GENERATE_URL]
    );
    assert.deepEqual(fetchImpl.calls[1].body, { refresh: "refresh-1" });
    assert.equal(storage.data.access_token, "access-2");
    assert.equal(storage.data.refresh_token, "refresh-2");
  });

  it("shares one refresh between concurrent requests", async () => {
    const fetchImpl = fakeFetch((url, init) => {
      if (url === REFRESH_URL) return json(200, { access: "access-2", refresh: "refresh-2" });
      return init.headers.Authorization === "Bearer access-2" ? json(200, { message: "ok" }) : json(401, {});
    });
    const api = createApi({ storage, fetchImpl, apiBase: API });

    await Promise.all([1, 2, 3].map(() => api.generate("connection-request", payload)));

    assert.equal(fetchImpl.calls.filter((c) => c.url === REFRESH_URL).length, 1);
  });

  it("ends the session when the refresh token is rejected", async () => {
    const fetchImpl = fakeFetch((url) => (url === REFRESH_URL ? json(401, {}) : json(401, {})));
    const api = createApi({ storage, fetchImpl, apiBase: API });

    await assert.rejects(api.generate("connection-request", payload), SessionExpiredError);
    assert.deepEqual(storage.data, {});
    assert.equal(errorMessage(new SessionExpiredError()), null);
  });

  it("does not loop when the retried request is rejected again", async () => {
    const fetchImpl = fakeFetch((url) =>
      url === REFRESH_URL ? json(200, { access: "access-2", refresh: "refresh-2" }) : json(401, {})
    );
    const api = createApi({ storage, fetchImpl, apiBase: API });

    await assert.rejects(api.generate("connection-request", payload), SessionExpiredError);
    assert.equal(fetchImpl.calls.length, 3);
    assert.deepEqual(storage.data, {});
  });

  it("keeps the session when the refresh fails for network reasons", async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url === REFRESH_URL) throw new TypeError("Failed to fetch");
      return json(401, {});
    });
    const api = createApi({ storage, fetchImpl, apiBase: API });

    await assert.rejects(api.generate("connection-request", payload), TypeError);
    assert.equal(storage.data.refresh_token, "refresh-1");
  });

  it("keeps the session when the refresh endpoint is throttled", async () => {
    const fetchImpl = fakeFetch((url) => (url === REFRESH_URL ? json(429, {}) : json(401, {})));
    const api = createApi({ storage, fetchImpl, apiBase: API });

    const error = await api.generate("connection-request", payload).catch((e) => e);

    assert.ok(error instanceof ApiError);
    assert.notEqual(error instanceof SessionExpiredError, true);
    assert.equal(storage.data.refresh_token, "refresh-1");
  });

  it("reports the daily limit on 429", async () => {
    const fetchImpl = fakeFetch(() => json(429, { detail: "Request was throttled." }));
    const api = createApi({ storage, fetchImpl, apiBase: API });

    const error = await api.generate("connection-request", payload).catch((e) => e);

    assert.equal(error.status, 429);
    assert.equal(errorMessage(error), "Daily limit reached (20 messages per day). Try again tomorrow.");
  });

  it("requires a stored access token", async () => {
    const fetchImpl = fakeFetch(() => json(200, {}));
    const api = createApi({ storage: memoryStorage(), fetchImpl, apiBase: API });

    await assert.rejects(api.generate("connection-request", payload), SessionExpiredError);
    assert.equal(fetchImpl.calls.length, 0);
  });
});

describe("login", () => {
  it("stores the token pair", async () => {
    const fetchImpl = fakeFetch(() => json(200, { access: "a", refresh: "r" }));
    const api = createApi({ storage: memoryStorage(), fetchImpl, apiBase: API });

    await api.login("alice", "pw with spaces ");

    assert.equal(fetchImpl.calls[0].url, `${API}/api/auth/login/`);
    assert.deepEqual(fetchImpl.calls[0].body, { username: "alice", password: "pw with spaces " });
    assert.equal(fetchImpl.calls[0].auth, undefined);
    assert.equal(await api.isSignedIn(), true);
  });

  it("drops a stale refresh token when the response has none", async () => {
    const store = memoryStorage({ refresh_token: "stale" });
    const fetchImpl = fakeFetch(() => json(200, { access: "a" }));
    const api = createApi({ storage: store, fetchImpl, apiBase: API });

    await api.login("alice", "pw");

    assert.deepEqual(store.data, { access_token: "a" });
  });

  it("reports bad credentials without touching stored tokens", async () => {
    const fetchImpl = fakeFetch(() => json(401, { detail: "No active account" }));
    const api = createApi({ storage, fetchImpl, apiBase: API });

    await assert.rejects(api.login("alice", "wrong"), (e) => e instanceof ApiError && e.status === 401);
    assert.equal(storage.data.refresh_token, "refresh-1");
  });
});

describe("clearSession", () => {
  it("removes both tokens", async () => {
    const api = createApi({ storage, fetchImpl: fakeFetch(() => json(200, {})), apiBase: API });

    await api.clearSession();

    assert.equal(await api.isSignedIn(), false);
  });
});
