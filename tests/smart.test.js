import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { readOwnProfile } from "../page.js";
import {
  DEFAULT_SETTINGS,
  DRAFT_CACHE_TTL_MS,
  canAutoDraft,
  draftCacheKey,
  jobMatchesCompany,
  loadCachedDrafts,
  loadSettings,
  pickType,
  profileFromPage,
  saveCachedDrafts,
  saveSettings,
} from "../smart.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const dom = (html) => new JSDOM(html).window.document;

function memoryStorage() {
  const data = {};
  return {
    data,
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(key) {
      delete data[key];
    },
  };
}

describe("readOwnProfile", () => {
  it("reads the owner's headline, sections and skills", () => {
    assert.deepEqual(readOwnProfile(dom(fixture("own-profile.html"))), {
      headline: "Lead Full-Stack Engineer · React, Django, AI",
      about: "I build AI products end to end.",
      experience: "Lead Engineer\nInspira · Full-time\n2021 - Present",
      education: "Mumbai University",
      skills: "React, Django",
    });
  });

  it("returns null on someone else's profile", () => {
    assert.equal(readOwnProfile(dom(fixture("profile.html"))), null);
  });
});

describe("pickType", () => {
  const job = { title: "Staff Engineer", company: "Northwind Labs" };

  it("picks a referral when the saved job is at this person's company", () => {
    assert.equal(pickType({ page: "profile", company: "Northwind Labs", pendingJob: job }), "referral_request");
    assert.equal(pickType({ page: "profile", company: "northwind labs inc.", pendingJob: job }), "referral_request");
  });

  it("picks a connection request otherwise", () => {
    assert.equal(pickType({ page: "profile", company: "Globex", pendingJob: job }), "connection_request");
    assert.equal(pickType({ page: "profile", company: "Globex", pendingJob: null }), "connection_request");
  });

  it("leaves other pages alone", () => {
    assert.equal(pickType({ page: "job", company: "", pendingJob: job }), null);
  });

  it("does not match unrelated or empty companies", () => {
    assert.equal(jobMatchesCompany({ company: "Meta" }, "Metabase"), false);
    assert.equal(jobMatchesCompany({ company: "" }, ""), false);
  });
});

describe("canAutoDraft", () => {
  it("needs every field the page can fill", () => {
    assert.equal(canAutoDraft("connection_request", { name: "Maya", company: "Northwind", role: "EM" }), true);
    assert.equal(canAutoDraft("connection_request", { name: "Maya", company: "", role: "EM" }), false);
    assert.equal(
      canAutoDraft("referral_request", { name: "Maya", company: "Northwind", role: "EM", job_title: "" }),
      false
    );
  });

  it("never auto-drafts replies or follow-ups", () => {
    assert.equal(canAutoDraft("followup", { name: "Maya" }), false);
    assert.equal(canAutoDraft("recruiter_reply", { recruiter_name: "Sam" }), false);
  });
});

describe("draft cache", () => {
  it("keys by profile, ignoring query strings and case", () => {
    assert.equal(draftCacheKey("https://www.linkedin.com/in/Maya-Chen/?miniProfile=1"), "drafts:in/maya-chen");
    assert.equal(draftCacheKey("https://www.linkedin.com/in/maya-chen/details/experience/"), "drafts:in/maya-chen");
    assert.equal(draftCacheKey("https://www.linkedin.com/feed/"), null);
  });

  it("returns drafts for the same type until they expire", async () => {
    const storage = memoryStorage();
    const entry = { type: "connection_request", drafts: [{ text: "a" }], activeVariant: 1 };
    await saveCachedDrafts(storage, "drafts:in/maya", entry, 1000);

    assert.equal((await loadCachedDrafts(storage, "drafts:in/maya", "connection_request", 2000)).activeVariant, 1);
    assert.equal(await loadCachedDrafts(storage, "drafts:in/maya", "referral_request", 2000), null);
    assert.equal(await loadCachedDrafts(storage, "drafts:in/maya", "connection_request", 1000 + DRAFT_CACHE_TTL_MS), null);
    assert.deepEqual(storage.data, {});
  });
});

describe("settings", () => {
  it("defaults to auto-draft on and remembers changes", async () => {
    const storage = memoryStorage();
    assert.deepEqual(await loadSettings(storage), DEFAULT_SETTINGS);

    await saveSettings(storage, { tone: "concise" });
    await saveSettings(storage, { autoDraft: false });
    assert.deepEqual(await loadSettings(storage), { autoDraft: false, tone: "concise" });
  });

  it("ignores an unknown saved tone", async () => {
    const storage = memoryStorage();
    await storage.set({ settings: { tone: "shouty" } });
    assert.equal((await loadSettings(storage)).tone, "formal");
  });
});

describe("profileFromPage", () => {
  const page = {
    headline: "Lead Engineer",
    about: "I build AI products.",
    experience: "Lead Engineer\nInspira",
    education: "Mumbai University",
    skills: "React, Django",
  };
  const existing = {
    headline: "My own headline",
    summary: "",
    skills: "",
    target_roles: "Staff roles",
    experience: "",
    writing_sample: "Hi there!",
    completeness: 40,
  };

  it("fills empty fields, keeps the rest and returns the full profile", () => {
    const { fields, changed } = profileFromPage(page, existing);
    assert.deepEqual(fields, {
      headline: "My own headline",
      summary: "I build AI products.",
      skills: "React, Django",
      target_roles: "Staff roles",
      experience: "Lead Engineer\nInspira\n\nEducation:\nMumbai University",
      writing_sample: "Hi there!",
    });
    assert.deepEqual(changed, ["Summary", "Skills", "Experience"]);
  });

  it("replaces filled fields only when asked", () => {
    const { fields, changed } = profileFromPage(page, existing, true);
    assert.equal(fields.headline, "Lead Engineer");
    assert.ok(changed.includes("Headline"));
  });

  it("works without a saved profile", () => {
    const { fields } = profileFromPage({ headline: "H".repeat(400) }, null);
    assert.equal(fields.headline.length, 150);
    assert.equal(fields.writing_sample, "");
  });
});
