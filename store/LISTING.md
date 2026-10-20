# Chrome Web Store listing kit

Everything needed to submit ConnectPilot to the Chrome Web Store, in the order the developer dashboard asks for it. Copy fields as written; keep them in sync with the code when behaviour changes.

## 0. Before you start

1. Google account with **2-Step Verification** turned on.
2. Register at the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) and pay the one-time **US$5** fee.
3. Verify the contact email: `paritoshkhubchandani2@gmail.com`.
4. Create a **reviewer test account** on https://connect-pilot.vercel.app/register (a throwaway username and strong password). Enter its credentials only in the dashboard's reviewer notes (section 6); never commit them.
5. Build the package: `npm run package:store` → `dist/connectpilot-extension-<version>-store.zip`. The store build drops the `localhost` development hosts from the manifest.

## 1. Package

Upload `dist/connectpilot-extension-<version>-store.zip`.

## 2. Store listing

**Name** (from the manifest): `ConnectPilot`

**Short description** (manifest `description`, 126 characters, limit 132):

> Draft personalized LinkedIn connection requests, referral asks, recruiter replies and follow-ups with AI. You review and send.

**Detailed description:**

> ConnectPilot writes first drafts of LinkedIn messages so you can reach out faster, in your own voice.
>
> Set up in one click: open ConnectPilot on your own LinkedIn profile and import it, or upload your resume on the web app. Then open ConnectPilot while viewing someone's profile: it reads their name, role, company and the visible About, experience and education sections, finds genuine common ground, and has three drafts in your voice ready, each from a different angle. On a job posting, save the job and ConnectPilot tailors your referral ask to it. In a LinkedIn conversation, it reads the latest messages and drafts your reply: tap how interested you are in a recruiter's role, or get a follow-up ready. Make one shorter, warmer, more specific or more formal with a click, copy it, and send it yourself.
>
> Four message types:
> • Connection requests that explain why you want to connect
> • Referral requests for a specific role, built from your background
> • Replies to recruiters, matched to how interested you are, written from the conversation you have open
> • Follow-ups after a meeting, event or earlier conversation, including replies to the last message in a thread
>
> Three tones: formal, friendly or concise.
>
> You stay in control:
> • ConnectPilot only drafts. It never sends messages, clicks buttons or automates anything on LinkedIn.
> • It reads the profile or job you are viewing only when you open the extension and shows you what it read. Auto-draft (on by default) writes drafts as soon as you open it on a profile; switch it off to send nothing until you click Generate.
> • Insert types the draft into LinkedIn's message box for you to review. It never presses Send.
> • Your drafts are saved to your private history on the ConnectPilot web app, where you can search and delete them.
>
> Sign in with a ConnectPilot account, or through the web app with Google. Free accounts can generate up to 20 messages a day.
>
> ConnectPilot is an independent tool and is not affiliated with, endorsed by or sponsored by LinkedIn.

**Category:** Productivity → Workflow & Planning (or "Tools" if offered)

**Language:** English

**Graphics:**

| Asset | File |
| --- | --- |
| Store icon (128×128) | `icon128.png` |
| Screenshot 1 (1280×800) | `store/assets/screenshot-1-draft.png` |
| Screenshot 2 (1280×800) | `store/assets/screenshot-2-signin.png` |
| Small promo tile (440×280) | `store/assets/promo-tile-440x280.png` |

Screenshots show the real popup rendered with fictional sample data (`store/tools/shots.py`); no real person's profile appears.

**Website:** `https://connect-pilot.vercel.app`
**Support email:** `paritoshkhubchandani2@gmail.com`

## 3. Privacy practices

**Single purpose:**

> ConnectPilot helps users write LinkedIn outreach messages: it pre-fills details from the LinkedIn profile the user is viewing and generates a draft message for the user to review, copy and send themselves.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `activeTab` | When the user opens the popup, grants temporary access to the current LinkedIn tab only: on a profile, to read the visible name, role, company, About, experience and education; on the user's own profile, to read their headline, About, experience, education and skills for an import they confirm; on a job page, to read the job title, company and description; in an open LinkedIn conversation, to read the latest messages of that one conversation (sender, time, text) to draft a reply; and, when the user clicks Insert, to type the chosen draft into the message box they have open. No access to other tabs or in the background. |
| `scripting` | Runs functions in the active tab (granted by `activeTab`): read-only functions that extract the profile, job or conversation text listed above, and, only when the user clicks Insert, one that types the draft into the open LinkedIn message or invitation-note field. It never clicks buttons or sends anything. |
| `storage` | Stores the user's ConnectPilot sign-in tokens, settings (auto-draft, tone) and a saved job (24 hours) in local extension storage, and the current drafts per profile in session storage (cleared when Chrome closes) so reopening the popup does not generate them again. |
| Host `https://connectpilot-api.onrender.com/*` | The ConnectPilot API: sign-in, token refresh, sign-out and message generation. |
| Content script on `https://connect-pilot.vercel.app/connect-extension*` | Receives sign-in tokens from the ConnectPilot web app when the user chooses "Sign in with ConnectPilot" (same-origin, origin-checked message). Runs only on that one page of our own site. |

**Remote code:** No, the extension does not use remote code. All JavaScript is in the package.

**Data usage** (tick these):

- **Personally identifiable information:** yes. The user's account username and email for sign-in; names of people the user writes to (from the profile or typed in).
- **Authentication information:** yes. Sign-in tokens stored locally; credentials sent to our API to sign in.
- **Website content:** yes. Name, role, company, About, experience and education read from the LinkedIn profile the user is viewing, and the title, company and description of a job posting the user is viewing, only when the popup is opened. Used to write the draft; the About, experience, education and job description text is not stored. On the user's own profile, the headline, About, experience, education and skills are saved to their ConnectPilot profile only when they confirm the import.
- **Personal communications:** yes. When the user opens the popup on a LinkedIn conversation, the latest messages of that one conversation (up to about 4,000 characters) are sent to our API to draft a reply. They are not stored.
- **User activity / web history / location / financial / health:** no.

**Certifications** (all three are true; tick them):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://connect-pilot.vercel.app/privacy`

## 4. Distribution

- Visibility: **Public** (or **Unlisted** for a soft launch: installable by link, not searchable).
- Regions: all.
- Pricing: free.

## 5. Test instructions (reviewer notes)

> 1. Install the extension and click the ConnectPilot toolbar icon.
> 2. Sign in with the test account below (username and password fields under "or use your username").
> 3. Open any LinkedIn profile page (https://www.linkedin.com/in/…) and click the icon again: the name, role and company are read from the page and three drafts are written automatically (untick "Auto-draft" at the bottom to turn this off).
> 4. Pick an option, optionally tweak it or change the tone and click Generate 3 New Drafts, then Copy or Insert. Insert types the draft into an open LinkedIn message box; nothing is ever sent by the extension.
> 5. Open a LinkedIn conversation (https://www.linkedin.com/messaging/…) and click the icon: the conversation is read, and a follow-up is drafted automatically; for a recruiter's message, tap Interested, Maybe or Not interested to draft the reply.
> 6. Optional: "Sign in with ConnectPilot" opens https://connect-pilot.vercel.app/connect-extension, which signs the extension in through the web app.
>
> Test account: username `<fill in>` / password `<fill in>`
>
> The API is hosted on a free plan and may take up to a minute to respond to the first request after a period of inactivity.

## 6. After submission

- Review usually takes a few days and can take weeks. Policy questions arrive at the contact email.
- Once published, installed copies update automatically from the store. Bump `version` in `manifest.json` and `package.json`, rebuild with `npm run package:store`, and upload for each release.
- The store-assigned extension ID needs no backend change: the API is reached through `host_permissions`, which Chrome exempts from CORS.
- Keep `/privacy` in the web app accurate if the extension starts collecting anything new, and update the data usage answers above to match.
