const API_BASE = "https://linkedin-copilot.duckdns.org";

// --- DOM refs ---
const authScreen = document.getElementById("authScreen");
const mainScreen = document.getElementById("mainScreen");
const logoutBtn = document.getElementById("logoutBtn");
const loginBtn = document.getElementById("loginBtn");
const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const authError = document.getElementById("authError");
const genError = document.getElementById("genError");
const outputSection = document.getElementById("outputSection");
const outputText = document.getElementById("outputText");
const profileBadge = document.getElementById("profileBadge");
const profileName = document.getElementById("profileName");
const genTypeSelect = document.getElementById("genType");

let selectedTone = "formal";

// --- Init ---
document.addEventListener("DOMContentLoaded", async () => {
  const { access_token } = await chrome.storage.local.get("access_token");
  if (access_token) {
    showMain();
    await loadProfileData();
  } else {
    showAuth();
  }

  genTypeSelect.addEventListener("change", switchFields);

  // Tone buttons
  document.querySelectorAll(".tone-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tone-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedTone = btn.dataset.tone;
    });
  });
});

// --- Auth ---
loginBtn.addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) return showAuthError("Fill in all fields.");

  loginBtn.textContent = "Signing in...";
  loginBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) throw new Error("Invalid credentials");

    const data = await res.json();
    await chrome.storage.local.set({
      access_token: data.access,
      refresh_token: data.refresh,
    });

    showMain();
    await loadProfileData();
  } catch (e) {
    showAuthError("Invalid username or password.");
  } finally {
    loginBtn.textContent = "Sign in";
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove(["access_token", "refresh_token"]);
  showAuth();
});

// --- Generate ---
generateBtn.addEventListener("click", async () => {
  const type = genTypeSelect.value;
  const payload = getPayload(type);

  if (!payload) return;

  // Add tone to payload
  payload.tone = selectedTone;

  genError.style.display = "none";
  outputSection.style.display = "none";
  generateBtn.textContent = "Generating...";
  generateBtn.disabled = true;

  try {
    const { access_token } = await chrome.storage.local.get("access_token");
    const endpoint = getEndpoint(type);

    const res = await fetch(`${API_BASE}/api/generate/${endpoint}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      await chrome.storage.local.remove(["access_token", "refresh_token"]);
      showAuth();
      return;
    }

    if (!res.ok) throw new Error("Generation failed");

    const data = await res.json();
    outputText.value = data.message;
    outputSection.style.display = "block";
  } catch (e) {
    genError.textContent = "Failed to generate. Try again.";
    genError.style.display = "block";
  } finally {
    generateBtn.textContent = "Generate Message";
    generateBtn.disabled = false;
  }
});

// --- Copy ---
copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(outputText.value);
  copyBtn.textContent = "Copied!";
  setTimeout(() => copyBtn.textContent = "Copy", 2000);
});

// --- Profile extraction via scripting API ---
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
            const escapedRole = data.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const match = text.match(new RegExp(escapedRole + '([^·\n]+)'));
            if (match) {
              const candidate = match[1].trim().split('·')[0].trim();
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
  } catch (e) {
    // Silent fail
  }
}

// --- Helpers ---
function showAuth() {
  authScreen.style.display = "block";
  mainScreen.style.display = "none";
  logoutBtn.style.display = "none";
}

function showMain() {
  authScreen.style.display = "none";
  mainScreen.style.display = "block";
  logoutBtn.style.display = "block";
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.style.display = "block";
}

function switchFields() {
  document.querySelectorAll(".fields").forEach((f) => f.style.display = "none");
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
