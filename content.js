// Extracts profile data from LinkedIn profile page DOM
function extractProfileData() {
  const data = {
    name: "",
    company: "",
    role: "",
    isLinkedInProfile: false,
  };

  // Check if on a LinkedIn profile page
  if (!window.location.href.includes("linkedin.com/in/")) {
    return data;
  }

  data.isLinkedInProfile = true;

  // Extract name
  const nameEl =
    document.querySelector("h1.text-heading-xlarge") ||
    document.querySelector("h1[class*='inline']") ||
    document.querySelector(".pv-text-details__left-panel h1");
  if (nameEl) {
    data.name = nameEl.textContent?.trim() || "";
  }

  // Extract current role (headline)
  const roleEl =
    document.querySelector(".text-body-medium.break-words") ||
    document.querySelector("[data-generated-suggestion-target] div") ||
    document.querySelector(".pv-text-details__left-panel .text-body-medium");
  if (roleEl) {
    const roleText = roleEl.textContent?.trim() || "";
    // Try to split "Role at Company" pattern
    if (roleText.includes(" at ")) {
      const parts = roleText.split(" at ");
      data.role = parts[0].trim();
      data.company = parts[1].trim();
    } else {
      data.role = roleText;
    }
  }

  // Extract company from experience section if not found
  if (!data.company) {
    const companyEl =
      document.querySelector(".pv-text-details__right-panel-item-link span") ||
      document.querySelector("[aria-label*='Current company'] span") ||
      document.querySelector(".experience-item .pv-entity__secondary-title");
    if (companyEl) {
      data.company = companyEl.textContent?.trim() || "";
    }
  }

  return data;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getProfileData") {
    const data = extractProfileData();
    sendResponse(data);
  }
  return true;
});
