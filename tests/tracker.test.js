import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { createApi } from "../api.js";
import { readConversation } from "../page.js";
import { canAutoDraft, pickType } from "../smart.js";
import { absoluteProfileUrl, followUpFields, trackerLabel } from "../tracker.js";

const API = "https://api.example.com";
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });

function fakeApi(handler) {
  const calls = [];
  const storage = {
    data: { access_token: "a1", refresh_token: "r1" },
    async get(keys) {
      return Object.fromEntries([].concat(keys).map((k) => [k, this.data[k]]));
    },
    async set(items) {
      Object.assign(this.data, items);
    },
    async remove() {},
  };
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    return handler(url, init);
  };
  return { api: createApi({ storage, fetchImpl, apiBase: API }), calls };
}

describe("tracker labels", () => {
  it("describes the contact's state", () => {
    assert.equal(trackerLabel(null), "");
    assert.equal(trackerLabel({ status: "drafted" }), "Drafted, not sent yet");
    assert.equal(trackerLabel({ status: "sent", days_since_sent: 0 }), "Sent today · waiting for a reply");
    assert.equal(trackerLabel({ status: "sent", days_since_sent: 6, follow_up_due: true }), "Sent 6 days ago · follow-up due");
    assert.equal(trackerLabel({ status: "replied" }), "They replied");
  });

  it("fills follow-up fields only when one is due", () => {
    assert.equal(followUpFields({ status: "sent", follow_up_due: false }), null);
    assert.deepEqual(followUpFields({ status: "sent", follow_up_due: true, days_since_sent: 6 }), {
      context: "I messaged them on LinkedIn 6 days ago and haven't heard back yet.",
      days_since: "6",
    });
  });

  it("drafts a due follow-up automatically on their profile", () => {
    const due = { status: "sent", follow_up_due: true };
    assert.equal(pickType({ page: "profile", company: "Acme", pendingJob: null, contact: due }), "followup");
    const fields = { name: "Priya", company: "Acme", role: "EM", ...followUpFields({ ...due, days_since_sent: 6 }) };
    assert.equal(canAutoDraft("followup", fields), true);
    assert.equal(canAutoDraft("followup", { ...fields, context: "" }), false);
  });
});

describe("profile links", () => {
  it("makes LinkedIn profile links absolute and ignores others", () => {
    assert.equal(absoluteProfileUrl("/in/sam-lee/"), "https://www.linkedin.com/in/sam-lee/");
    assert.equal(absoluteProfileUrl("https://www.linkedin.com/in/sam/"), "https://www.linkedin.com/in/sam/");
    assert.equal(absoluteProfileUrl("/company/acme/"), "");
    assert.equal(absoluteProfileUrl("https://evil.com/in/sam/"), "");
    assert.equal(absoluteProfileUrl(""), "");
  });

  it("reads the other person's profile link from a conversation", () => {
    const html = readFileSync(new URL("./fixtures/thread.html", import.meta.url), "utf8");
    const conversation = readConversation(new JSDOM(html).window.document);
    assert.equal(absoluteProfileUrl(conversation.profileHref), "https://www.linkedin.com/in/sam-lee/");
  });
});

describe("tracker API", () => {
  it("looks up a contact and returns null when not tracked", async () => {
    const { api, calls } = fakeApi((url) =>
      url.includes("sam") ? json(200, { id: 3, status: "sent" }) : json(404, { detail: "Not found." })
    );
    assert.deepEqual(await api.lookupContact("https://www.linkedin.com/in/sam/"), { id: 3, status: "sent" });
    assert.equal(await api.lookupContact("https://www.linkedin.com/in/nobody/"), null);
    assert.equal(calls[0].url, `${API}/api/contacts/lookup/?linkedin_url=${encodeURIComponent("https://www.linkedin.com/in/sam/")}`);
  });

  it("reports sent and replied events", async () => {
    const { api, calls } = fakeApi(() => json(200, { id: 3, status: "sent" }));
    await api.touchContact({ linkedin_url: "https://www.linkedin.com/in/sam/", name: "Sam", event: "sent" });
    assert.equal(calls[0].url, `${API}/api/contacts/touch/`);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].body.event, "sent");
  });

  it("treats an ignored reply (204) as no contact", async () => {
    const { api } = fakeApi(() => json(204));
    assert.equal(await api.touchContact({ linkedin_url: "x", event: "replied" }), null);
  });
});
