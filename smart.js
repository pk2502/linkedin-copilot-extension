// Popup decisions that need no DOM: which message type fits the page, when
// drafts can be written without asking, the per-page draft cache, saved
// settings, and turning an own-profile read into ConnectPilot profile fields.

export const SETTINGS_KEY = "settings";
export const DEFAULT_SETTINGS = { autoDraft: true, tone: "formal" };
export const TONES = ["formal", "friendly", "concise"];

export const DRAFT_CACHE_PREFIX = "drafts:";
export const DRAFT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const PROFILE_LIMITS = {
  headline: 150,
  summary: 1500,
  skills: 500,
  target_roles: 300,
  experience: 4000,
  writing_sample: 1500,
};

// Fields each type needs before drafts can be written automatically.
const AUTO_REQUIRED = {
  connection_request: ["name", "company", "role"],
  referral_request: ["name", "company", "role", "job_title"],
};

const normalise = (text) => (text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** True when a saved job looks like it belongs to this person's company. */
export function jobMatchesCompany(job, company) {
  const a = normalise(job?.company);
  const b = normalise(company);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

/**
 * Message type for the page. On someone's profile: a referral request when the
 * saved job is at their company, otherwise a connection request. Null keeps
 * whatever the user picked.
 */
export function pickType({ page, company, pendingJob }) {
  if (page === "profile") return jobMatchesCompany(pendingJob, company) ? "referral_request" : "connection_request";
  return null;
}

/** Whether drafts can be written without the user filling anything in. */
export function canAutoDraft(type, payload) {
  const required = AUTO_REQUIRED[type];
  return Boolean(required && payload && required.every((field) => String(payload[field] ?? "").trim()));
}

/** Cache key for drafts written on this page (a LinkedIn profile path). */
export function draftCacheKey(url) {
  try {
    const { pathname } = new URL(url);
    const match = pathname.match(/^\/in\/([^/]+)/);
    return match ? `${DRAFT_CACHE_PREFIX}in/${decodeURIComponent(match[1]).toLowerCase()}` : null;
  } catch {
    return null;
  }
}

/** Drafts cached for this page and type, or null. Expired entries are removed. */
export async function loadCachedDrafts(storage, key, type, now = Date.now()) {
  if (!storage || !key) return null;
  const entry = (await storage.get(key))[key];
  if (!entry) return null;
  if (!(now - entry.savedAt < DRAFT_CACHE_TTL_MS) || !Array.isArray(entry.drafts)) {
    await storage.remove(key);
    return null;
  }
  return entry.type === type ? entry : null;
}

export async function saveCachedDrafts(storage, key, entry, now = Date.now()) {
  if (!storage || !key) return;
  await storage.set({ [key]: { ...entry, savedAt: now } });
}

export async function loadSettings(storage) {
  const saved = (await storage.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  if (!TONES.includes(settings.tone)) settings.tone = DEFAULT_SETTINGS.tone;
  settings.autoDraft = settings.autoDraft !== false;
  return settings;
}

export async function saveSettings(storage, changes) {
  const next = { ...(await loadSettings(storage)), ...changes };
  await storage.set({ [SETTINGS_KEY]: next });
  return next;
}

const LABELS = { headline: "Headline", summary: "Summary", skills: "Skills", experience: "Experience" };

/**
 * Merge an own-profile read (from readOwnProfile) into the saved profile.
 * Empty fields are filled; fields already written are replaced only when
 * `replace` is true. Returns the full profile for PUT /api/profile/ and the
 * labels of the fields that change.
 */
export function profileFromPage(page, existing, replace = false) {
  const suggestions = {
    headline: page?.headline || "",
    summary: page?.about || "",
    skills: page?.skills || "",
    experience: [page?.experience, page?.education ? `Education:\n${page.education}` : ""]
      .filter(Boolean)
      .join("\n\n"),
  };
  const fields = {};
  for (const key of Object.keys(PROFILE_LIMITS)) fields[key] = existing?.[key] ?? "";

  const changed = [];
  for (const [key, raw] of Object.entries(suggestions)) {
    const value = raw.trim().slice(0, PROFILE_LIMITS[key]).trim();
    if (!value || value === fields[key].trim()) continue;
    if (fields[key].trim() && !replace) continue;
    fields[key] = value;
    changed.push(LABELS[key]);
  }
  return { fields, changed };
}
