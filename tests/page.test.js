import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import {
  formatRecipientContext,
  insertIntoLinkedIn,
  isJobPage,
  isProfilePage,
  readJobPosting,
  readProfileSections,
} from "../page.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const dom = (html) => new JSDOM(html).window.document;

describe("readProfileSections", () => {
  const sections = readProfileSections(dom(fixture("profile.html")));

  it("reads About without the heading or the screen-reader duplicate", () => {
    assert.match(sections.about, /^I lead the frontend platform team at Northwind Labs\.\s+Previously built design systems at Globex\.$/);
  });

  it("reads experience and education entries", () => {
    assert.equal(
      sections.experience,
      "Engineering Manager\nNorthwind Labs · Full-time\n2022 - Present\nSenior Frontend Engineer\nGlobex\n2018 - 2022"
    );
    assert.equal(sections.education, "IIT Bombay\nB.Tech, Computer Science");
  });

  it("ignores other sections", () => {
    assert.doesNotMatch(JSON.stringify(sections), /followers/);
  });

  it("returns empty strings when sections are missing", () => {
    assert.deepEqual(readProfileSections(dom("<main><h1>Someone</h1></main>")), {
      about: "",
      experience: "",
      education: "",
    });
  });

  it("caps long sections", () => {
    const long = "word ".repeat(1000);
    const html = `<section><div id="about"></div><span aria-hidden="true">${long}</span></section>`;
    const { about } = readProfileSections(dom(html));
    assert.ok(about.length <= 1501);
    assert.ok(about.endsWith("…"));
  });
});

describe("formatRecipientContext", () => {
  it("labels each section and skips empty ones", () => {
    assert.equal(
      formatRecipientContext({ about: "A", experience: "", education: "E" }),
      "About:\nA\n\nEducation:\nE"
    );
    assert.equal(formatRecipientContext({ about: "", experience: "", education: "" }), "");
  });

  it("stays within the API limit", () => {
    const text = formatRecipientContext({ about: "x".repeat(3000), experience: "y".repeat(3000), education: "" });
    assert.equal(text.length, 4000);
  });
});

describe("readJobPosting", () => {
  it("reads title, company and description", () => {
    const job = readJobPosting(dom(fixture("job.html")));
    assert.equal(job.title, "Staff Frontend Engineer");
    assert.equal(job.company, "Contoso Cloud");
    assert.match(job.description, /7\+ years of React/);
    assert.match(job.description, /Accessibility \(WCAG\)/);
  });

  it("returns null when there is no job description", () => {
    assert.equal(readJobPosting(dom("<h1>Feed</h1>")), null);
  });
});

describe("insertIntoLinkedIn", () => {
  it("types into an open message box without clicking Send", () => {
    const doc = dom(fixture("messaging.html"));
    let submitted = false;
    doc.querySelector("form").addEventListener("submit", () => (submitted = true));
    doc.querySelector(".msg-form__send-button").addEventListener("click", () => (submitted = true));
    let inputEvents = 0;
    doc.querySelector(".msg-form__contenteditable").addEventListener("input", () => inputEvents++);

    const result = insertIntoLinkedIn("Hi Maya, great to connect.", doc);

    assert.deepEqual(result, { ok: true, kind: "message" });
    assert.equal(doc.querySelector(".msg-form__contenteditable").textContent, "Hi Maya, great to connect.");
    assert.equal(inputEvents, 1);
    assert.equal(submitted, false);
  });

  it("fills the invitation note and fires an input event", () => {
    const doc = dom(fixture("invite-note.html"));
    let inputEvents = 0;
    doc.querySelector("textarea").addEventListener("input", () => inputEvents++);

    const result = insertIntoLinkedIn("Hi Maya, would love to connect.", doc);

    assert.deepEqual(result, { ok: true, kind: "note" });
    assert.equal(doc.querySelector("textarea").value, "Hi Maya, would love to connect.");
    assert.equal(inputEvents, 1);
  });

  it("refuses a note longer than the field allows", () => {
    const doc = dom(fixture("invite-note.html"));

    assert.deepEqual(insertIntoLinkedIn("x".repeat(301), doc), { ok: false, reason: "too_long", max: 300 });
    assert.equal(doc.querySelector("textarea").value, "");
  });

  it("reports when no message field is open", () => {
    assert.deepEqual(insertIntoLinkedIn("Hi", dom(fixture("profile.html"))), { ok: false, reason: "no_field" });
  });
});

describe("page detection", () => {
  it("recognises profile and job pages", () => {
    assert.equal(isProfilePage("https://www.linkedin.com/in/maya-chen/"), true);
    assert.equal(isProfilePage("https://www.linkedin.com/feed/"), false);
    assert.equal(isJobPage("https://www.linkedin.com/jobs/view/4012345678/"), true);
    assert.equal(isJobPage("https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=react"), true);
    assert.equal(isJobPage("https://www.linkedin.com/jobs/"), false);
    assert.equal(isJobPage("https://evil.example/jobs/view/1"), false);
    assert.equal(isProfilePage("not a url"), false);
  });
});
