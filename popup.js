import { API_BASE, WEB_BASE } from "./config.js";
import { ApiError, SessionExpiredError, createApi, errorMessage } from "./api.js";

const api = createApi({ storage: chrome.storage.local, apiBase: API_BASE });

// --- DOM refs ---
const authScreen = document.getElementById("authScreen");
const mainScreen = document.getElementById("mainScreen");
const logoutBtn = document.getElementById("logoutBtn");
const loginBtn = document.getElementById("loginBtn");
const connectBtn = document.getElementById("connectBtn");
const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const authError = document.getElementById("authError");
const authNotice = document.getElementById("authNotice");
const genError = document.getElementById("genError");
const outputSection = document.getElementById("outputSection");
const outputText = document.getElementById("outputText");
const profileBadge = document.getElementById("profileBadge");
const profileName = document.getElementById("profileName");
const genTypeSelect = document.getElementById("genType");

let selectedTone = "formal";

// --- Init ---
document.addEventListener("DOMContentLoaded", async () => {
  genTypeSelect.addEventListener("change", switchFields);

  document.querySelectorAll(".tone-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tone-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedTone = btn.dataset.tone;
    });
  });

  if (await api.isSignedIn()) {
    showMain();
    await loadProfileData();
  } else {
    showAuth();
  }
});

// --- Auth ---
loginBtn.addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username || !password) return showAuthError("Fill in all fields.");

  loginBtn.textContent = "Signing in...";
  loginBtn.disabled = true;
  hideAuthMessages();

  try {
    await api.login(username, password);
    document.getElementById("password").value = "";
    showMain();
    await loadProfileData();
  } catch (e) {
    showAuthError(e instanceof ApiError ? e.message : "Sign-in failed. Check your connection.");
  } finally {
    loginBtn.textContent = "Sign in";
    loginBtn.disabled = false;
  }
});

// Sign in through the web app (works for Google accounts too). The web app
// mints a token pair for the extension and connect.js stores it.
connectBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: `${WEB_BASE}/connect-extension` });
  window.close();
});

logoutBtn.addEventListener("click", async () => {
  await api.clearSession();
  showAuth();
});

// --- Generate ---
generateBtn.addEventListener("click", async () => {
  const type = genTypeSelect.value;
  const payload = getPayload(type);

  if (!payload) return;

  payload.tone = selectedTone;

  genError.style.display = "none";
  outputSection.style.display = "none";
  generateBtn.textContent = "Generating...";
  generateBtn.disabled = true;

  try {
    const data = await api.generate(getEndpoint(type), payload);
    outputText.value = data.message;
    outputSection.style.display = "block";
  } catch (e) {
    if (e instanceof SessionExpiredError) {
      showAuth("Your session expired. Sign in again.");
      return;
    }
    showGenError(errorMessage(e));
  } finally {
    generateBtn.textContent = "Generate Message";
    generateBtn.disabled = false;
  }
});

// --- Copy ---
copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(outputText.value);
  copyBtn.textContent = "Copied!";
  setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
});

// --- Profile extraction via scripting API (activeTab, granted when the popup opens) ---
async function loadProfileData() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes("linkedin.com/in/")) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const data = { name: "", company: "", role: "", isLinkedInProfile: true };

        const titleMatch = document.title.match(/^(.+?)\s*\|\s*LinkedIn/);
        if (titleMatch) data.name = titleMatch[1].trim();

        if (data.name) {
          const card = document.querySelector(`div[aria-label="${data.name}"]`);
          if (card) {
            const cardText = card.textContent.trim();
            const afterName = cardText.slice(data.name.length).trim();
            if (afterName.includes(" at ")) {
              const parts = afterName.split(" at ");
              data.role = parts[0].trim();
              data.company = parts.slice(1).join(" at ").trim();
            } else {
              data.role = afterName;
            }
          }
        }

        if (!data.company && data.name && data.role) {
          const section = document.querySelector('section[aria-label="Primary content"]');
          if (section) {
            const text = section.textContent.trim();
            const escapedRole = data.role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const match = text.match(new RegExp(escapedRole + "([^·\n]+)"));
            if (match) {
              const candidate = match[1].trim().split("·")[0].trim();
              if (candidate && candidate.length > 0 && candidate.length < 80) {
                data.company = candidate;
              }
            }
          }
        }

        return data;
      },
    });

    const profile = results?.[0]?.result;
    if (!profile?.isLinkedInProfile || !profile.name) return;

    profileBadge.style.display = "flex";
    profileName.textContent = profile.name;

    const fills = {
      "cr-name": profile.name,
      "cr-company": profile.company,
      "cr-role": profile.role,
      "rr-name": profile.name,
      "rr-company": profile.company,
      "rr-role": profile.role,
      "rec-name": profile.name,
      "rec-company": profile.company,
      "fu-name": profile.name,
      "fu-company": profile.company,
      "fu-role": profile.role,
    };

    for (const [id, value] of Object.entries(fills)) {
      const el = document.getElementById(id);
      if (el && value) el.value = value;
    }
  } catch {
    // Not a profile page or LinkedIn's markup changed: leave fields for manual entry.
  }
}

// --- Helpers ---
function showAuth(notice) {
  authScreen.style.display = "block";
  mainScreen.style.display = "none";
  logoutBtn.style.display = "none";
  hideAuthMessages();
  if (notice) {
    authNotice.textContent = notice;
    authNotice.style.display = "block";
  }
}

function showMain() {
  authScreen.style.display = "none";
  mainScreen.style.display = "block";
  logoutBtn.style.display = "block";
}

function hideAuthMessages() {
  authError.style.display = "none";
  authNotice.style.display = "none";
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.style.display = "block";
}

function switchFields() {
  document.querySelectorAll(".fields").forEach((f) => (f.style.display = "none"));
  const active = document.getElementById(`fields-${genTypeSelect.value}`);
  if (active) active.style.display = "block";
}

function getEndpoint(type) {
  return type.replace(/_/g, "-");
}

function getPayload(type) {
  switch (type) {
    case "connection_request": {
      const name = document.getElementById("cr-name").value.trim();
      const company = document.getElementById("cr-company").value.trim();
      const role = document.getElementById("cr-role").value.trim();
      if (!name || !company || !role) { showGenError("Fill in all fields."); return null; }
      return { name, company, role };
    }
    case "referral_request": {
      const name = document.getElementById("rr-name").value.trim();
      const company = document.getElementById("rr-company").value.trim();
      const role = document.getElementById("rr-role").value.trim();
      const job_title = document.getElementById("rr-job").value.trim();
      const your_background = document.getElementById("rr-background").value.trim();
      if (!name || !company || !role || !job_title || !your_background) { showGenError("Fill in all fields."); return null; }
      return { name, company, role, job_title, your_background };
    }
    case "recruiter_reply": {
      const recruiter_name = document.getElementById("rec-name").value.trim();
      const company = document.getElementById("rec-company").value.trim();
      const job_title = document.getElementById("rec-job").value.trim();
      const your_background = document.getElementById("rec-background").value.trim();
      const interest_level = document.getElementById("rec-interest").value;
      if (!recruiter_name || !company || !job_title || !your_background) { showGenError("Fill in all fields."); return null; }
      return { recruiter_name, company, job_title, your_background, interest_level };
    }
    case "followup": {
      const name = document.getElementById("fu-name").value.trim();
      const company = document.getElementById("fu-company").value.trim();
      const role = document.getElementById("fu-role").value.trim();
      const context = document.getElementById("fu-context").value.trim();
      const days_since = document.getElementById("fu-days").value.trim();
      if (!name || !company || !role || !context || !days_since) { showGenError("Fill in all fields."); return null; }
      return { name, company, role, context, days_since };
    }
    default:
      return null;
  }
}

function showGenError(msg) {
  genError.textContent = msg;
  genError.style.display = "block";
}
