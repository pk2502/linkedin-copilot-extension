# ConnectPilot — Chrome Extension

[![CI](https://github.com/pk2502/linkedin-copilot-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/pk2502/linkedin-copilot-extension/actions/workflows/ci.yml)

Draft LinkedIn connection requests, referral asks, recruiter replies and follow-ups with AI, right from a LinkedIn profile. ConnectPilot only drafts: you review, copy and send messages yourself. It never clicks, sends or automates anything on LinkedIn.

## Features

- 4 message types: Connection Request, Referral Request, Recruiter Reply, Follow-Up
- 3 tones: Formal, Friendly, Concise (the last one you used is remembered)
- Auto-draft: on someone's profile, picks the message type (a referral when your saved job is at their company, otherwise a connection request), collapses the form to one line and writes three drafts as soon as you open the popup. Drafts are kept per profile until Chrome closes, so reopening the popup costs nothing. Turn it off with the checkbox at the bottom
- Conversations: in a LinkedIn conversation (messaging page or chat bubble), reads the latest messages of that conversation and drafts your next message. A recruiter's message gets Interested / Maybe / Not interested buttons; anything else gets a follow-up drafted automatically. The messages are used for the draft only and are not stored
- Import your own profile: on your own LinkedIn profile, review and save your headline, About, experience, education and skills to your ConnectPilot profile
- Auto-fills name, role and company from the LinkedIn profile you have open, and uses the visible About, experience and education sections to find genuine common ground (shown in the popup, with a Clear button)
- On a LinkedIn job page: "Ask for a referral for this job" saves the job (for 24 hours, in the extension only) and tailors the referral ask to it
- Insert: types the chosen draft into the LinkedIn message box or invitation note you have open. It never presses Send
- Three drafts per request, each from a different angle, written with your saved ConnectPilot profile
- One-click tweaks: shorter, warmer, more specific, more formal
- One-click copy
- Sign in with your ConnectPilot account, including accounts created with Google
- Stays signed in: expired access tokens are refreshed automatically

## Install (unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Pin ConnectPilot from the extensions menu.

## Sign in

- **Sign in with ConnectPilot** (recommended, works with Google): opens `connect-pilot.vercel.app/connect-extension`. Sign in there if needed; the page creates a separate session for the extension and hands it over. Close the tab and open the extension.
- **Username and password**: for accounts that have a password.

## Usage

1. Once: open your own LinkedIn profile, click the ConnectPilot icon and **Review import**, or upload your resume at https://connect-pilot.vercel.app/dashboard/profile.
2. Open someone's LinkedIn profile and click the ConnectPilot icon. Three drafts are written automatically when name, role and company can be read from the page (otherwise fill them in and click **Generate 3 Drafts**).
3. In a conversation, click the icon: a follow-up is drafted from the latest messages, or, for a recruiter, tap how interested you are.
4. Switch between the options, tweak one if needed, then **Insert** it into the open LinkedIn message box or **Copy** it, and send it yourself.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Keep your sign-in tokens, settings and saved job in the extension's local storage, and drafts per profile in session storage (cleared when Chrome closes). |
| `https://connectpilot-api.onrender.com/*` | Call the ConnectPilot API. |
| `activeTab` + `scripting` | Read the LinkedIn profile, job page or conversation you have open when you open the popup, and type a draft into the message box when you click Insert |
| Content script on `connect-pilot.vercel.app/connect-extension` | Receive the sign-in from the web app. It runs on no other page. |

`http://localhost:8001/*` and `http://localhost:3000/connect-extension*` are included for local development.

## Development

No build step. Edit the files and click **Reload** on `chrome://extensions`.

- API and web app URLs live in `config.js`.
- `api.js`: token storage, single-flight token refresh, authenticated requests.
- `connect.js`: content script for the web app sign-in hand-off.
- `page.js`: functions injected into the LinkedIn tab (read profile sections, your own profile, job postings and the open conversation, insert a draft). Self-contained, read-only except Insert, never sends.
- `job-store.js`: the job saved for a referral ask (local, 24 hours).
- `smart.js`: type picking, auto-draft rules, the per-profile draft cache, settings, and own-profile import mapping (no DOM).
- `popup.html` / `popup.js` / `styles.css`: the popup UI.

Tests use Node's built-in test runner (Node 22.22.2+) and jsdom with saved LinkedIn-like pages in `tests/fixtures/`:

```sh
npm ci     # test tooling (jsdom) only; the extension has no runtime dependencies
npm test
```

## Packaging

```sh
npm run package   # creates dist/connectpilot-extension-<version>.zip
```

The zip contains only the runtime files and is ready for the Chrome Web Store.

## Web app

[connect-pilot.vercel.app](https://connect-pilot.vercel.app)

CI runs the tests and builds the package on every push; the zip is attached to each run as the `connectpilot-extension` artifact.

## Chrome Web Store

`npm run package:store` builds `dist/connectpilot-extension-<version>-store.zip`, identical to the regular package except that the `localhost` development hosts are removed from the manifest. Listing text, permission justifications, privacy answers, reviewer notes and images are in [`store/`](store/LISTING.md). Regenerate the screenshots with `python3 store/tools/shots.py` (needs Python Playwright). Privacy policy: https://connect-pilot.vercel.app/privacy
