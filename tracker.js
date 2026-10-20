// Outreach tracker helpers for the popup (no DOM, no network).

/** Short status line for the popup chip. */
export function trackerLabel(contact) {
  if (!contact) return "";
  if (contact.status === "sent") {
    const days = contact.days_since_sent ?? 0;
    const ago = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
    return contact.follow_up_due ? `Sent ${ago} · follow-up due` : `Sent ${ago} · waiting for a reply`;
  }
  if (contact.status === "replied") return "They replied";
  if (contact.status === "done") return "Done";
  return "Drafted, not sent yet";
}

/**
 * Follow-up fields for someone who hasn't replied, so a follow-up can be
 * drafted without typing. Null unless a follow-up is due.
 */
export function followUpFields(contact) {
  if (!contact?.follow_up_due) return null;
  const days = String(contact.days_since_sent ?? 0);
  return {
    context: `I messaged them on LinkedIn ${days} days ago and haven't heard back yet.`,
    days_since: days,
  };
}

/** The other person's LinkedIn profile URL from a link found on the page. */
export function absoluteProfileUrl(href, base = "https://www.linkedin.com/") {
  if (!href) return "";
  try {
    const url = new URL(href, base);
    return /(^|\.)linkedin\.com$/.test(url.hostname) && url.pathname.startsWith("/in/") ? url.href : "";
  } catch {
    return "";
  }
}
