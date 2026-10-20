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
