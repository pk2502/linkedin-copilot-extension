// API client for the popup: token storage, single-flight refresh, and
// authenticated requests that retry once after refreshing an expired token.
//
// The backend rotates refresh tokens and blacklists the previous one, so two
// concurrent refreshes with the same token would end the session. All callers
// share one in-flight refresh.

export const ACCESS_KEY = "access_token";
export const REFRESH_KEY = "refresh_token";

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** User-facing text for a failed request, or null when the UI should show the sign-in screen. */
export function errorMessage(error) {
  if (error instanceof SessionExpiredError) return null;
  if (error instanceof ApiError) {
    if (error.status === 429) return "Daily limit reached (20 messages per day). Try again tomorrow.";
    if (error.status === 400) return "Please check the fields and try again.";
  }
  return "Failed to generate. Try again.";
}

/**
 * @param {object} deps
 * @param {{get: Function, set: Function, remove: Function}} deps.storage  chrome.storage.local-compatible (promise API)
 * @param {Function} [deps.fetchImpl]
 * @param {string} deps.apiBase
 */
export function createApi({ storage, fetchImpl = (...args) => fetch(...args), apiBase }) {
  let refreshInFlight = null;

  async function getTokens() {
    const data = await storage.get([ACCESS_KEY, REFRESH_KEY]);
    return { access: data[ACCESS_KEY] || null, refresh: data[REFRESH_KEY] || null };
  }

  /** Store a fresh sign-in. A missing refresh token removes any stored one. */
  async function startSession(access, refresh) {
    if (refresh) {
      await storage.set({ [ACCESS_KEY]: access, [REFRESH_KEY]: refresh });
    } else {
      await storage.set({ [ACCESS_KEY]: access });
      await storage.remove(REFRESH_KEY);
    }
  }

  async function clearSession() {
    await storage.remove([ACCESS_KEY, REFRESH_KEY]);
  }

  async function performRefresh() {
    const { refresh } = await getTokens();
    if (!refresh) throw new SessionExpiredError();

    // Network failures propagate as-is: a flaky connection is not a logout.
    const response = await fetchImpl(`${apiBase}/api/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    if (response.status === 400 || response.status === 401) throw new SessionExpiredError();
    if (!response.ok) throw new ApiError(response.status, `Token refresh failed (${response.status})`);

    const data = await response.json();
    await storage.set(
      data.refresh ? { [ACCESS_KEY]: data.access, [REFRESH_KEY]: data.refresh } : { [ACCESS_KEY]: data.access }
    );
    return data.access;
  }

  function refreshAccessToken() {
    if (!refreshInFlight) {
      refreshInFlight = performRefresh().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  function send(path, { method = "GET", body } = {}, token) {
    return fetchImpl(`${apiBase}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** Authenticated JSON request; refreshes and retries once on 401. */
  async function request(path, options = {}) {
    const { access } = await getTokens();
    if (!access) throw new SessionExpiredError();

    let response = await send(path, options, access);
    if (response.status === 401) {
      let fresh;
      try {
        fresh = await refreshAccessToken();
      } catch (error) {
        if (error instanceof SessionExpiredError) await clearSession();
        throw error;
      }
      response = await send(path, options, fresh);
      if (response.status === 401) {
        await clearSession();
        throw new SessionExpiredError();
      }
    }

    if (!response.ok) throw new ApiError(response.status, `Request failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  }

  async function login(username, password) {
    const response = await send("/api/auth/login/", { method: "POST", body: { username, password } });
    if (response.status === 400 || response.status === 401) {
      throw new ApiError(response.status, "Invalid username or password.");
    }
    if (!response.ok) throw new ApiError(response.status, "Sign-in failed. Try again.");
    const data = await response.json();
    await startSession(data.access, data.refresh);
  }

  function generate(endpoint, payload) {
    return request(`/api/generate/${endpoint}/`, { method: "POST", body: payload });
  }

  async function isSignedIn() {
    const { access, refresh } = await getTokens();
    return Boolean(access || refresh);
  }

  return { getTokens, startSession, clearSession, refreshAccessToken, request, login, generate, isSignedIn };
}
