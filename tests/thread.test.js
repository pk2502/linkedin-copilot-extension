import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { formatConversation, isMessagingPage, readConversation } from "../page.js";
import { canAutoDraft, pickThreadType, splitHeadline, threadCacheKey } from "../smart.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const dom = (html) => new JSDOM(html).window.document;

describe("readConversation", () => {
  const conversation = readConversation(dom(fixture("thread.html")));

  it("reads the other person and their headline", () => {
    assert.equal(conversation.name, "Sam Lee");
    assert.equal(conversation.headline, "Technical Recruiter at Acme Cloud");
  });

  it("reads each message with sender, date and time, oldest first", () => {
    assert.deepEqual(
      conversation.messages.map((m) => [m.from, m.date, m.time, m.text]),
      [
        ["them", "Oct 12", "10:02 AM", "Hi Paritosh, we're hiring a Staff Engineer for our platform team."],
        ["them", "Oct 12", "10:02 AM", "Would you be open to a quick call this week?"],
        ["me", "Oct 12", "11:15 AM", "Thanks Sam! Could you share the job description?"],
        ["them", "Today", "9:40 AM", "Sure, attached. Remote-friendly, 40-50 LPA. Free Thursday?"],
      ]
    );
  });

  it("falls back to sender names when messages are not marked", () => {
    const html = fixture("thread.html").replaceAll(" msg-s-event-listitem--other", "");
    const froms = readConversation(dom(html)).messages.map((m) => m.from);
    assert.deepEqual(froms, ["them", "them", "me", "them"]);
  });

  it("returns null without an open conversation", () => {
    assert.equal(readConversation(dom(fixture("messaging.html"))), null);
    assert.equal(readConversation(dom(fixture("profile.html"))), null);
  });

  it("keeps only the latest messages", () => {
    const items = Array.from(
      { length: 20 },
      (_, i) =>
        `<li class="msg-s-message-list__event"><div class="msg-s-event-listitem"><p class="msg-s-event-listitem__body">m${i}</p></div></li>`
    ).join("");
    const html = `<div class="msg-convo-wrapper"><h2 class="msg-entity-lockup__entity-title">A</h2><ul>${items}</ul></div>`;
    const { messages } = readConversation(dom(html));
    assert.equal(messages.length, 12);
    assert.equal(messages.at(-1).text, "m19");
  });
});

describe("formatConversation", () => {
  const conversation = readConversation(dom(fixture("thread.html")));

  it("writes one labelled line per message", () => {
    assert.equal(
      formatConversation(conversation).split("\n")[2],
      "Paritosh K (me), Oct 12 11:15 AM: Thanks Sam! Could you share the job description?"
    );
  });

  it("drops the oldest messages first when too long", () => {
    const text = formatConversation(conversation, 130);
    assert.ok(text.length <= 130);
    assert.match(text, /Free Thursday\?$/);
    assert.doesNotMatch(text, /hiring a Staff Engineer/);
  });
});

describe("thread helpers", () => {
  it("detects messaging pages", () => {
    assert.equal(isMessagingPage("https://www.linkedin.com/messaging/thread/2-abc/"), true);
    assert.equal(isMessagingPage("https://www.linkedin.com/in/sam/"), false);
  });

  it("picks a recruiter reply when they wrote last about a job", () => {
    const conversation = readConversation(dom(fixture("thread.html")));
    assert.equal(pickThreadType(conversation), "recruiter_reply");
  });

  it("picks a follow-up when I wrote last or nobody talks about a job", () => {
    const mine = { messages: [{ from: "them", text: "We're hiring!" }, { from: "me", text: "Thanks" }] };
    assert.equal(pickThreadType(mine), "followup");
    const friend = { headline: "Designer at Globex", messages: [{ from: "them", text: "Great to meet you at the conference!" }] };
    assert.equal(pickThreadType(friend), "followup");
  });

  it("splits a headline into role and company", () => {
    assert.deepEqual(splitHeadline("Technical Recruiter at Acme Cloud | Hiring engineers"), {
      role: "Technical Recruiter",
      company: "Acme Cloud",
    });
    assert.deepEqual(splitHeadline("Founder"), { role: "Founder", company: "" });
    assert.deepEqual(splitHeadline(""), { role: "", company: "" });
  });

  it("changes the cache key when a new message arrives", () => {
    const url = "https://www.linkedin.com/messaging/thread/2-abc/";
    const before = { messages: [{ from: "me", time: "9:00 AM", text: "Hi" }] };
    const after = { messages: [...before.messages, { from: "them", time: "9:05 AM", text: "Hello!" }] };
    assert.match(threadCacheKey(url, before), /^drafts:thread\/2-abc:/);
    assert.notEqual(threadCacheKey(url, before), threadCacheKey(url, after));
    assert.equal(threadCacheKey("https://www.linkedin.com/feed/", after), null);
  });

  it("auto-drafts follow-ups from a conversation, never recruiter replies", () => {
    assert.equal(canAutoDraft("followup", { name: "Maya" }, { conversation: true }), true);
    assert.equal(canAutoDraft("followup", { name: "" }, { conversation: true }), false);
    assert.equal(canAutoDraft("recruiter_reply", { name: "Sam" }, { conversation: true }), false);
  });
});
