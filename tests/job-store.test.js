import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PENDING_JOB_KEY,
  PENDING_JOB_TTL_MS,
  clearPendingJob,
  jobDescriptionFor,
  loadPendingJob,
  savePendingJob,
} from "../job-store.js";

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

const JOB = { title: "Staff Engineer", company: "Contoso", description: "React, design systems" };

describe("pending job", () => {
  it("saves and loads a job", async () => {
    const storage = memoryStorage();

    await savePendingJob(storage, JOB, 1000);

    assert.deepEqual(await loadPendingJob(storage, 2000), { ...JOB, savedAt: 1000 });
  });

  it("expires after 24 hours and removes the stale job", async () => {
    const storage = memoryStorage();
    await savePendingJob(storage, JOB, 0);

    assert.equal(await loadPendingJob(storage, PENDING_JOB_TTL_MS + 1), null);
    assert.equal(PENDING_JOB_KEY in storage.data, false);
  });

  it("caps field lengths", async () => {
    const storage = memoryStorage();

    const saved = await savePendingJob(storage, { title: "t".repeat(500), description: "d".repeat(9000) }, 0);

    assert.equal(saved.title.length, 150);
    assert.equal(saved.description.length, 6000);
    assert.equal(saved.company, "");
  });

  it("ignores missing or malformed data and can be cleared", async () => {
    const storage = memoryStorage();
    assert.equal(await loadPendingJob(storage), null);

    storage.data[PENDING_JOB_KEY] = { title: "x" };
    assert.equal(await loadPendingJob(storage), null);

    await savePendingJob(storage, JOB);
    await clearPendingJob(storage);
    assert.equal(await loadPendingJob(storage), null);
  });
});

describe("jobDescriptionFor", () => {
  it("puts title and company before the posting", () => {
    assert.equal(jobDescriptionFor(JOB), "Staff Engineer at Contoso\n\nReact, design systems");
    assert.equal(jobDescriptionFor({ ...JOB, company: "" }), "Staff Engineer\n\nReact, design systems");
  });

  it("stays within the API limit", () => {
    assert.equal(jobDescriptionFor({ ...JOB, description: "x".repeat(6000) }).length, 6000);
  });
});
