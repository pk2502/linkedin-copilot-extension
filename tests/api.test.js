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
    assert.equal(errorMessage(error), "Daily limit reached. Try again tomorrow.");
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

describe("logout", () => {
  const LOGOUT_URL = `${API}/api/auth/logout/`;

  it("clears tokens and revokes the refresh token", async () => {
    const storage = memoryStorage({ access_token: "a1", refresh_token: "r1" });
    const fetchImpl = fakeFetch(() => json(200, {}));
    const api = createApi({ storage, fetchImpl, apiBase: API });

    await api.logout();

    assert.deepEqual(storage.data, {});
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(fetchImpl.calls[0].url, LOGOUT_URL);
    assert.deepEqual(fetchImpl.calls[0].body, { refresh: "r1" });
  });

  it("signs out locally even when the request fails or hangs", async () => {
    for (const handler of [
      () => Promise.reject(new TypeError("Failed to fetch")),
      (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))),
    ]) {
      const storage = memoryStorage({ access_token: "a1", refresh_token: "r1" });
      const api = createApi({ storage, fetchImpl: fakeFetch(handler), apiBase: API });

      await api.logout({ timeoutMs: 20 });

      assert.deepEqual(storage.data, {});
    }
  });

  it("makes no request without a refresh token", async () => {
    const storage = memoryStorage({ access_token: "a1" });
    const fetchImpl = fakeFetch(() => json(200, {}));
    const api = createApi({ storage, fetchImpl, apiBase: API });

    await api.logout();

    assert.equal(fetchImpl.calls.length, 0);
  });
});

describe("errorMessage for provider failures", () => {
  it("maps 502 to a retry message", () => {
    assert.equal(errorMessage(new ApiError(502, "x")), "AI service is busy. Try again in a moment.");
  });
});

describe("drafts", () => {
  const DRAFTS_URL = `${API}/api/drafts/`;

  it("requests three drafts with the type in the body", async () => {
    const storage = memoryStorage({ access_token: "a1", refresh_token: "r1" });
    const fetchImpl = fakeFetch(() => json(201, { id: 5, variants: ["a", "b", "c"] }));
    const api = createApi({ storage, fetchImpl, apiBase: API });

    const result = await api.draft("connection_request", { name: "Priya", tone: "formal" });

    assert.deepEqual(result, { id: 5, variants: ["a", "b", "c"] });
    assert.equal(fetchImpl.calls[0].url, DRAFTS_URL);
    assert.equal(fetchImpl.calls[0].init.method, "POST");
    assert.deepEqual(fetchImpl.calls[0].body, { type: "connection_request", name: "Priya", tone: "formal" });
    assert.equal(fetchImpl.calls[0].auth, "Bearer a1");
  });

  it("tweaks a variant", async () => {
    const storage = memoryStorage({ access_token: "a1", refresh_token: "r1" });
    const fetchImpl = fakeFetch(() => json(201, { id: 6, text: "Shorter." }));
    const api = createApi({ storage, fetchImpl, apiBase: API });

    const result = await api.tweak(5, 1, "shorter");

    assert.equal(result.text, "Shorter.");
    assert.equal(fetchImpl.calls[0].url, `${API}/api/drafts/5/tweak/`);
    assert.deepEqual(fetchImpl.calls[0].body, { variant: 1, instruction: "shorter" });
  });

  it("loads the profile", async () => {
    const storage = memoryStorage({ access_token: "a1", refresh_token: "r1" });
    const fetchImpl = fakeFetch(() => json(200, { completeness: 65 }));
    const api = createApi({ storage, fetchImpl, apiBase: API });

    assert.equal((await api.getProfile()).completeness, 65);
    assert.equal(fetchImpl.calls[0].url, `${API}/api/profile/`);
    assert.equal(fetchImpl.calls[0].init.method, "GET");
  });

  it("surfaces the backend hint when a background is missing", async () => {
    const storage = memoryStorage({ access_token: "a1", refresh_token: "r1" });
    const hint = "Add your background here or fill in your profile first.";
    const fetchImpl = fakeFetch(() => json(400, { your_background: [hint] }));
    const api = createApi({ storage, fetchImpl, apiBase: API });

    const error = await api.draft("referral_request", {}).catch((e) => e);

    assert.equal(error.status, 400);
    assert.equal(errorMessage(error), hint);
  });

  it("keeps the generic 400 message for other validation errors and non-JSON bodies", async () => {
    const storage = memoryStorage({ access_token: "a1", refresh_token: "r1" });
    const api = createApi({
      storage,
      fetchImpl: fakeFetch(() => new Response("oops", { status: 400 })),
      apiBase: API,
    });

    const error = await api.draft("connection_request", {}).catch((e) => e);

    assert.equal(errorMessage(error), "Please check the fields and try again.");
  });
});
