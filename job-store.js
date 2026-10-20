// The job a referral ask is for, carried from a LinkedIn job page to the
// referrer's profile. Kept in local extension storage only, for 24 hours.

export const PENDING_JOB_KEY = "pending_job";
export const PENDING_JOB_TTL_MS = 24 * 60 * 60 * 1000;

export async function savePendingJob(storage, job, now = Date.now()) {
  const value = {
    title: String(job.title ?? "").slice(0, 150),
    company: String(job.company ?? "").slice(0, 150),
    description: String(job.description ?? "").slice(0, 6000),
    savedAt: now,
  };
  await storage.set({ [PENDING_JOB_KEY]: value });
  return value;
}

/** The saved job, or null when there is none or it has expired (expired jobs are removed). */
export async function loadPendingJob(storage, now = Date.now()) {
  const data = await storage.get(PENDING_JOB_KEY);
  const job = data?.[PENDING_JOB_KEY];
  if (!job || typeof job.savedAt !== "number" || !job.description) return null;
  if (now - job.savedAt > PENDING_JOB_TTL_MS) {
    await storage.remove(PENDING_JOB_KEY);
    return null;
  }
  return job;
}

export function clearPendingJob(storage) {
  return storage.remove(PENDING_JOB_KEY);
}

/** Job text for the API: title and company first, then the posting, within the 6000-character limit. */
export function jobDescriptionFor(job) {
  const heading = job.company ? `${job.title} at ${job.company}` : job.title;
  return `${heading}\n\n${job.description}`.slice(0, 6000);
}
