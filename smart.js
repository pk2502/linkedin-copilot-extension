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
  // Filled from the tracker when a follow-up is due (see tracker.js).
  followup: ["name", "company", "role", "context", "days_since"],
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
 * Message type for the page. On someone's profile: a follow-up when the tracker
 * says one is due, a referral request when the saved job is at their company,
 * otherwise a connection request. Null keeps
 * whatever the user picked.
 */
export function pickType({ page, company, pendingJob, contact = null }) {
  if (page !== "profile") return null;
  if (contact?.follow_up_due) return "followup";
  return jobMatchesCompany(pendingJob, company) ? "referral_request" : "connection_request";
}

/**
 * Whether drafts can be written without the user filling anything in. With a
 * conversation, a follow-up needs only the name; a recruiter reply still waits
 * for the user's interest level, so it is never automatic.
 */
export function canAutoDraft(type, payload, { conversation = false } = {}) {
  if (conversation && type === "followup") return Boolean(String(payload?.name ?? "").trim());
  const required = AUTO_REQUIRED[type];
  return Boolean(required && payload && required.every((field) => String(payload[field] ?? "").trim()));
}

// Words a recruiter uses about a job. Checked only in the other person's messages.
const RECRUITER_WORDS =
  /\b(hiring|recruit\w*|role|position|opening|opportunit\w*|job description|jd|candidate|interview\w*|compensation|salary|ctc|lpa|notice period|headhunt\w*|talent acquisition)\b/i;

/**
 * Message type for an open conversation: a recruiter reply when the other
 * person wrote last about a job, otherwise a follow-up (which also covers
 * replying to anyone else and nudging after your own last message).
 */
export function pickThreadType(conversation) {
  const messages = conversation?.messages || [];
  const last = messages[messages.length - 1];
  if (!last || last.from !== "them") return "followup";
  const theirs = messages.filter((m) => m.from === "them").map((m) => m.text).join("\n");
  const headline = conversation.headline || "";
  return RECRUITER_WORDS.test(theirs) || /recruit|talent|hiring/i.test(headline) ? "recruiter_reply" : "followup";
}

/** "Technical Recruiter at Acme Cloud" -> { role, company }. */
export function splitHeadline(headline) {
  const text = (headline || "").split(/\s[|·•]\s/)[0].trim();
  const at = text.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
  return at ? { role: at[1].trim(), company: at[2].trim() } : { role: text, company: "" };
}

/** Cache key for drafts written on this page (a LinkedIn profile or conversation). */
export function draftCacheKey(url) {
  try {
    const { pathname } = new URL(url);
    const match = pathname.match(/^\/in\/([^/]+)/);
    if (match) return `${DRAFT_CACHE_PREFIX}in/${decodeURIComponent(match[1]).toLowerCase()}`;
    const thread = pathname.match(/^\/messaging\/thread\/([^/]+)/);
    return thread ? `${DRAFT_CACHE_PREFIX}thread/${thread[1]}` : null;
  } catch {
    return null;
  }
}

/**
 * Cache key for a conversation: the page key plus a signature of the latest
 * message, so a new message in the thread means new drafts.
 */
export function threadCacheKey(url, conversation) {
  const base = draftCacheKey(url);
  const messages = conversation?.messages || [];
  const last = messages[messages.length - 1];
  if (!base || !last) return null;
  return `${base}:${messages.length}:${last.from}:${last.time}:${last.text.length}`;
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
