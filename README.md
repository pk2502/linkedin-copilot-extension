# ConnectPilot — Chrome Extension

[![CI](https://github.com/pk2502/linkedin-copilot-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/pk2502/linkedin-copilot-extension/actions/workflows/ci.yml)

Draft LinkedIn connection requests, referral asks, recruiter replies and follow-ups with AI, right from a LinkedIn profile. ConnectPilot only drafts: you review, copy and send messages yourself. It never clicks, sends or automates anything on LinkedIn.

## Features

- 4 message types: Connection Request, Referral Request, Recruiter Reply, Follow-Up
- 3 tones: Formal, Friendly, Concise
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

1. Open a LinkedIn profile.
2. Click the ConnectPilot icon. Name, role and company are filled in when they can be read from the page.
3. Choose a message type and tone, then **Generate 3 Drafts**. Switch between the options, tweak one if needed, and copy it.

Fill in your profile once at https://connect-pilot.vercel.app/dashboard/profile (the popup links to it while it is incomplete); drafts use it automatically.
4. Review, **Copy**, and paste it into LinkedIn yourself.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Keep your sign-in tokens in the extension's local storage. |
| `https://connectpilot-api.onrender.com/*` | Call the ConnectPilot API. |
| `activeTab` + `scripting` | Read the LinkedIn profile or job page you have open when you open the popup, and type a draft into the message box when you click Insert |
| Content script on `connect-pilot.vercel.app/connect-extension` | Receive the sign-in from the web app. It runs on no other page. |

`http://localhost:8001/*` and `http://localhost:3000/connect-extension*` are included for local development.

## Development

No build step. Edit the files and click **Reload** on `chrome://extensions`.

- API and web app URLs live in `config.js`.
- `api.js`: token storage, single-flight token refresh, authenticated requests.
- `connect.js`: content script for the web app sign-in hand-off.
- `page.js`: functions injected into the LinkedIn tab (read profile sections and job postings, insert a draft). Self-contained, read-only except Insert, never sends.
- `job-store.js`: the job saved for a referral ask (local, 24 hours).
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
