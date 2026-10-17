# ConnectPilot — Chrome Extension

Draft LinkedIn connection requests, referral asks, recruiter replies and follow-ups with AI, right from a LinkedIn profile. ConnectPilot only drafts: you review, copy and send messages yourself. It never clicks, sends or automates anything on LinkedIn.

## Features

- 4 message types: Connection Request, Referral Request, Recruiter Reply, Follow-Up
- 3 tones: Formal, Friendly, Concise
- Auto-fills name, role and company from the LinkedIn profile you have open
- One-click copy
- Sign in with your ConnectPilot account, including accounts created with Google
- Stays signed in: expired access tokens are refreshed automatically

## Install (unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Pin ConnectPilot from the extensions menu.

## Sign in

- **Sign in with ConnectPilot** (recommended, works with Google): opens `li-copilot.vercel.app/connect-extension`. Sign in there if needed; the page creates a separate session for the extension and hands it over. Close the tab and open the extension.
- **Username and password**: for accounts that have a password.

## Usage

1. Open a LinkedIn profile.
2. Click the ConnectPilot icon. Name, role and company are filled in when they can be read from the page.
3. Choose a message type and tone, then **Generate Message**.
4. Review, **Copy**, and paste it into LinkedIn yourself.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab`, `scripting` | Read the open LinkedIn profile (name, headline) when you click the icon. |
| `storage` | Keep your sign-in tokens in the extension's local storage. |
| `https://connectpilot-api.onrender.com/*` | Call the ConnectPilot API. |
| Content script on `li-copilot.vercel.app/connect-extension` | Receive the sign-in from the web app. It runs on no other page. |

`http://localhost:8001/*` and `http://localhost:3000/connect-extension*` are included for local development.

## Development

No build step. Edit the files and click **Reload** on `chrome://extensions`.

- API and web app URLs live in `config.js`.
- `api.js`: token storage, single-flight token refresh, authenticated requests.
- `connect.js`: content script for the web app sign-in hand-off.
- `popup.html` / `popup.js` / `styles.css`: the popup UI.

Tests use Node's built-in test runner (Node 20+, no dependencies):

```sh
npm test
```

## Packaging

```sh
npm run package   # creates dist/connectpilot-extension-<version>.zip
```

The zip contains only the runtime files and is ready for the Chrome Web Store.

## Web app

[li-copilot.vercel.app](https://li-copilot.vercel.app)
