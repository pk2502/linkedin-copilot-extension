// Functions injected into the active LinkedIn tab with chrome.scripting.executeScript.
//
// Each function must be self-contained (Chrome serialises the function body;
// nothing from this module's scope is available in the page). They only READ
// the page, except insertIntoLinkedIn, which types text into a message field
// the user has open. Nothing here ever clicks a button or sends a message.
//
// LinkedIn changes its markup often, so every reader tries several selectors
// and returns empty values instead of throwing. Callers treat empty results as
// "not found" and fall back to manual entry.

/**
 * Visible text of the About, Experience and Education sections of a profile.
 * Returns { about, experience, education }, each a string (possibly empty).
 */
export function readProfileSections(doc = document) {
  const LIMITS = { about: 1500, experience: 1800, education: 600 };

  const clean = (text) =>
    text
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")
      .trim();

  function sectionText(anchorId, heading) {
    const anchor = doc.getElementById(anchorId);
    const section = anchor?.closest("section");
    if (!section) return "";

    // LinkedIn renders each string twice (visible + screen-reader copy). The
    // aria-hidden spans hold one visible copy each; fall back to all text.
    const spans = [...section.querySelectorAll('span[aria-hidden="true"]')]
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    const lines = spans.length ? spans : [section.textContent];

    const unique = [];
    for (const line of lines) {
      if (line !== unique[unique.length - 1]) unique.push(line);
    }
    let text = clean(unique.join("\n"));
    if (text.toLowerCase().startsWith(heading.toLowerCase())) text = text.slice(heading.length).trim();
    return text;
  }

  const cap = (text, max) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

  return {
    about: cap(sectionText("about", "About"), LIMITS.about),
    experience: cap(sectionText("experience", "Experience"), LIMITS.experience),
    education: cap(sectionText("education", "Education"), LIMITS.education),
  };
}

/**
 * The signed-in member's own profile, for importing into ConnectPilot.
 * Returns null unless the page shows the owner's edit controls, so it never
 * offers to import someone else's profile. Otherwise returns
 * { headline, about, experience, education, skills }.
 *
 * Self-contained like every injected function, so the section reader is a
 * copy of the one in readProfileSections with larger limits.
 */
export function readOwnProfile(doc) {
  doc = doc || document;
  const LIMITS = { headline: 150, about: 1500, experience: 3500, education: 500, skills: 500 };

  const ownerSignals = [
    'a[href*="/edit/intro/"]',
    'a[href*="/edit/forms/intro/"]',
    'a[href*="/add-edit/"]',
    'button[aria-label="Add profile section"]',
    '[aria-label^="Edit intro"]',
  ];
  const ownerButtonText = /^(add profile section|add section|open to|enhance profile)$/i;
  const isOwn =
    ownerSignals.some((selector) => doc.querySelector(selector)) ||
    [...doc.querySelectorAll("main button")].some((b) => ownerButtonText.test(b.textContent.replace(/\s+/g, " ").trim()));
  if (!isOwn) return null;

  const clean = (text) => text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  const cap = (text, max) => (text.length > max ? text.slice(0, max).trimEnd() : text);

  function lines(anchorId) {
    const section = doc.getElementById(anchorId)?.closest("section");
    if (!section) return [];
    const spans = [...section.querySelectorAll('span[aria-hidden="true"]')]
      .map((el) => clean(el.textContent))
      .filter(Boolean);
    const unique = [];
    for (const line of spans) if (line !== unique[unique.length - 1]) unique.push(line);
    return unique;
  }

  function sectionText(anchorId, heading) {
    const all = lines(anchorId);
    if (all[0]?.toLowerCase() === heading.toLowerCase()) all.shift();
    return all.join("\n");
  }

  // Skills list entries are interleaved with endorsement counts and links.
  const noise = /endorse|^show all|^\d+\s|passed linkedin skill assessment|experiences? (at|across)/i;
  const skills = [...new Set(lines("skills").filter((line) => line.toLowerCase() !== "skills" && !noise.test(line)))]
    .filter((line) => line.length <= 60)
    .join(", ");

  const headlineEl =
    doc.querySelector("main .pv-text-details__left-panel .text-body-medium") ||
    doc.querySelector("main .text-body-medium.break-words") ||
    doc.querySelector("main [data-generated-suggestion-target]");
  const headline = headlineEl ? clean(headlineEl.textContent) : "";

  return {
    headline: cap(headline, LIMITS.headline),
    about: cap(sectionText("about", "About"), LIMITS.about),
    experience: cap(sectionText("experience", "Experience"), LIMITS.experience),
    education: cap(sectionText("education", "Education"), LIMITS.education),
    skills: cap(skills, LIMITS.skills),
  };
}

/**
 * The LinkedIn conversation the user has open: the full messaging page or a
 * chat bubble. Returns null when none is open, otherwise
 * { name, headline, profileHref, messages: [{ from: "them" | "me", name, date, time, text }] }
 * with the most recent messages last (at most 12).
 */
export function readConversation(doc) {
  doc = doc || document;
  const clean = (text) => (text || "").replace(/\s+/g, " ").trim();
  const firstText = (root, selectors) => {
    for (const selector of selectors) {
      const text = clean(root.querySelector(selector)?.textContent);
      if (text) return text;
    }
    return "";
  };

  const scopes = [...doc.querySelectorAll(".msg-overlay-conversation-bubble, .msg-convo-wrapper, .msg-thread")].filter(
    (el) => el.querySelector(".msg-s-event-listitem")
  );
  if (!scopes.length) return null;
  // The conversation the user is typing in, else the last one opened.
  const active = doc.activeElement;
  const scope = scopes.find((el) => active && el.contains(active)) || scopes[scopes.length - 1];

  const name = firstText(scope, [
    ".msg-entity-lockup__entity-title",
    ".msg-overlay-bubble-header__title",
    ".msg-thread__link-to-profile .t-bold",
    "h2",
  ]);
  const headline = firstText(scope, [".msg-entity-lockup__entity-info", ".msg-thread__link-to-profile .t-12"]);
  const profileLink = scope.querySelector('.msg-thread__link-to-profile, a[href*="/in/"]');
  const profileHref = profileLink?.getAttribute("href") || "";

  const items = [...scope.querySelectorAll(".msg-s-event-listitem")];
  // Some layouts don't mark the other person's messages; then go by sender name.
  const marked = items.some((el) => el.classList.contains("msg-s-event-listitem--other"));

  const messages = [];
  let date = "";
  let sender = "";
  let time = "";
  for (const event of scope.querySelectorAll(".msg-s-message-list__event")) {
    date = clean(event.querySelector(".msg-s-message-list__time-heading")?.textContent) || date;
    const meta = event.querySelector(".msg-s-message-group__meta");
    if (meta) {
      sender = clean(meta.querySelector(".msg-s-message-group__name")?.textContent) || sender;
      time = clean(meta.querySelector(".msg-s-message-group__timestamp")?.textContent) || time;
    }
    for (const item of event.querySelectorAll(".msg-s-event-listitem")) {
      const text = clean(item.querySelector(".msg-s-event-listitem__body")?.textContent);
      if (!text) continue;
      const fromThem = marked ? item.classList.contains("msg-s-event-listitem--other") : sender === name;
      messages.push({ from: fromThem ? "them" : "me", name: sender, date, time, text: text.slice(0, 1500) });
    }
  }
  if (!messages.length) return null;
  return { name, headline, profileHref, messages: messages.slice(-12) };
}

/**
 * The open job on a LinkedIn job page (/jobs/view/... or the job panel in
 * search and collections). Returns { title, company, description } or null.
 */
export function readJobPosting(doc = document) {
  const first = (selectors) => {
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      const text = el?.textContent?.replace(/\s+/g, " ").trim();
      if (text) return { el, text };
    }
    return null;
  };

  const title = first([
    ".job-details-jobs-unified-top-card__job-title h1",
    ".job-details-jobs-unified-top-card__job-title",
    ".jobs-unified-top-card__job-title",
    ".top-card-layout__title",
    "h1",
  ]);
  const company = first([
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
  ]);
  const descriptionEl =
    doc.querySelector("#job-details") ||
    doc.querySelector(".jobs-description__content") ||
    doc.querySelector(".jobs-box__html-content") ||
    doc.querySelector(".description__text");

  const description = (descriptionEl?.innerText ?? descriptionEl?.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  if (!title || !description) return null;
  return {
    title: title.text.slice(0, 150),
    company: (company?.text ?? "").slice(0, 150),
    description: description.slice(0, 6000),
  };
}

/**
 * Type `text` into the LinkedIn message or invitation-note field the user has
 * open. Never clicks Send. Returns one of:
 *   { ok: true, kind: "message" | "note" }
 *   { ok: false, reason: "no_field" }
 *   { ok: false, reason: "too_long", max }
 */
export function insertIntoLinkedIn(text, doc = document) {
  const view = doc.defaultView;
  // Without a layout engine (e.g. tests) nothing has client rects, not even
  // the root element; then treat every connected element as visible.
  const hasLayout = doc.documentElement.getClientRects().length > 0;
  const visible = (el) => el?.isConnected && (!hasLayout || el.getClientRects().length > 0);

  const notes = [...doc.querySelectorAll("textarea#custom-message, textarea[name='message']")].filter(visible);
  const editors = [
    ...doc.querySelectorAll(
      ".msg-form__contenteditable[contenteditable='true'], [role='textbox'][contenteditable='true']"
    ),
  ].filter(visible);

  const active = doc.activeElement;
  let target =
    (active && (notes.includes(active) || editors.includes(active)) && active) ||
    notes[notes.length - 1] ||
    editors[editors.length - 1];
  if (!target) return { ok: false, reason: "no_field" };

  if (target.tagName === "TEXTAREA") {
    const max = Number(target.getAttribute("maxlength")) || 0;
    if (max && text.length > max) return { ok: false, reason: "too_long", max };
    // Use the native setter so React/Ember notice the change.
    const setter = Object.getOwnPropertyDescriptor(view.HTMLTextAreaElement.prototype, "value").set;
    setter.call(target, text);
    target.dispatchEvent(new view.Event("input", { bubbles: true }));
    target.focus();
    return { ok: true, kind: "note" };
  }

  target.focus();
  // insertText goes through the editor's own input handling (keeps LinkedIn's
  // Send button state correct). Fall back to setting the text directly.
  const inserted = typeof doc.execCommand === "function" && doc.execCommand("insertText", false, text);
  if (!inserted) {
    target.textContent = text;
    target.dispatchEvent(new view.InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }
  return { ok: true, kind: "message" };
}

/** Text sent to the API as recipient_context, from readProfileSections output. */
export function formatRecipientContext(sections, max = 4000) {
  const parts = [];
  if (sections?.about) parts.push(`About:\n${sections.about}`);
  if (sections?.experience) parts.push(`Experience:\n${sections.experience}`);
  if (sections?.education) parts.push(`Education:\n${sections.education}`);
  const text = parts.join("\n\n");
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Conversation text sent to the API: one line per message, oldest first.
 * The oldest messages are dropped first when it is too long.
 */
export function formatConversation(conversation, max = 4000) {
  const lines = (conversation?.messages || []).map((m) => {
    const who = m.from === "them" ? `${m.name || conversation.name || "Them"} (them)` : `${m.name || "Me"} (me)`;
    const when = [m.date, m.time].filter(Boolean).join(" ");
    return `${who}${when ? `, ${when}` : ""}: ${m.text}`;
  });
  while (lines.length > 1 && lines.join("\n").length > max) lines.shift();
  return lines.join("\n").slice(-max);
}

/** True for LinkedIn messaging pages. */
export function isMessagingPage(url) {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname.endsWith("linkedin.com") && pathname.startsWith("/messaging/");
  } catch {
    return false;
  }
}

/** True for LinkedIn pages that show a single job posting. */
export function isJobPage(url) {
  try {
    const { hostname, pathname, searchParams } = new URL(url);
    if (!hostname.endsWith("linkedin.com")) return false;
    return /^\/jobs\/view\/\d+/.test(pathname) || (pathname.startsWith("/jobs/") && searchParams.has("currentJobId"));
  } catch {
    return false;
  }
}

/** True for LinkedIn member profile pages. */
export function isProfilePage(url) {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname.endsWith("linkedin.com") && pathname.startsWith("/in/");
  } catch {
    return false;
  }
}
