# Test Equipment Matrix — GitHub + JSONbin Setup Guide

This guide walks you through deploying your test matrix using **GitHub Pages** (hosting) and **JSONbin.io** (shared data storage), so you can test the shared-data concept before going full Azure AD + SharePoint.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  GitHub Pages  (hosting)                            │
│  https://yourusername.github.io/test-equipment-matrix │
│                                                     │
│  Serves: index.html, flow.html, CSS, JS             │
│  Anyone with the URL can load the app               │
└──────────────────────┬──────────────────────────────┘
                       │
                       │  fetch() API calls
                       ▼
┌─────────────────────────────────────────────────────┐
│  JSONbin.io  (shared data store)                    │
│                                                     │
│  One JSON "bin" holds the entire app state:          │
│  matrix data, flow positions, edges, preferences     │
│                                                     │
│  • Pull on load → everyone sees latest data          │
│  • Push on save → changes propagate to others        │
│  • Auto-poll every 30s → picks up other's changes    │
└─────────────────────────────────────────────────────┘
```

**How this maps to the Azure plan:**
| Test setup | Production setup |
|---|---|
| GitHub Pages | Azure Static Web App |
| JSONbin.io | SharePoint Lists via Microsoft Graph API |
| API key in config file | Azure AD token via MSAL.js |

---

## Step 1: Create a JSONbin Account & Bin

**Time: 5 minutes**

1. Go to [https://jsonbin.io](https://jsonbin.io) and sign up (free)
2. Once logged in, go to **Dashboard**
3. Click **"Create a Bin"**
4. In the editor, paste this as the initial content:
   ```json
   {}
   ```
5. Click **Create**
6. You'll see a URL like:  
   `https://api.jsonbin.io/v3/b/665a1f2ce41b4d34e4f12abc`  
   → The long string after `/b/` is your **Bin ID**. Copy it.
7. Go to **Dashboard → API Keys** (or click your profile icon)
8. Copy your **X-Master-Key** (starts with `$2a$10$...`)

You now have both values you need:
- **Bin ID**: `665a1f2ce41b4d34e4f12abc` (example)
- **API Key**: `$2a$10$xxxxx...` (example)

---

## Step 2: Configure the App

**Time: 2 minutes**

Open `js/sync-config.js` and replace the placeholder values:

```javascript
const SYNC_CONFIG = {
    BIN_ID:   '665a1f2ce41b4d34e4f12abc',    // ← your actual Bin ID
    API_KEY:  '$2a$10$your-actual-key-here',   // ← your actual X-Master-Key
    POLL_MS:  30000,                            // Check for updates every 30s
    ENABLED:  true,
};
```

**Save the file.** That's it — the app will now sync to JSONbin.

---

## Step 3: Test Locally First

**Time: 2 minutes**

Before pushing to GitHub, test that sync works locally:

1. Open `index.html` in your browser
2. Look for the **sync status indicator** — a small pill in the bottom-right corner:
   - 🟢 Green dot = connected and in sync
   - 🟡 Amber dot = syncing in progress
   - 🔴 Red dot = error (check browser console F12)
   - ⚪ Grey dot = offline / no credentials
3. Add some test data (a test column, some equipment rows)
4. The status should flash amber briefly, then go green
5. Open a **second browser tab** with the same file
6. After ~30 seconds the second tab should pick up the changes

If the dot stays green and data appears in the second tab — sync is working!

---

## Step 4: Create a GitHub Repository

**Time: 10 minutes**

### Option A: Using GitHub.com (no command line)

1. Go to [github.com](https://github.com) and sign in (or create a free account)
2. Click the **"+"** button → **New repository**
3. Fill in:
   - **Repository name**: `test-equipment-matrix`
   - **Description**: Test Equipment Matrix — shared tracking tool
   - **Visibility**: Choose **Private** (recommended) or Public
   - Leave "Initialize with README" **unchecked**
4. Click **Create repository**
5. On the next page, click **"uploading an existing file"**
6. Drag and drop ALL your project files:
   - `index.html`
   - `flow.html`
   - `css/` folder (all CSS files)
   - `js/` folder (all JS files **EXCEPT `sync-config.js`**)
   - `.gitignore`
7. **⚠️ IMPORTANT**: Do **NOT** upload `js/sync-config.js` — it contains your API key!
8. Click **Commit changes**

### Option B: Using Git command line

```bash
cd test-equipment-matrix

git init
git add .
# The .gitignore will automatically exclude sync-config.js
git commit -m "Initial commit — test equipment matrix"

git remote add origin https://github.com/YOUR_USERNAME/test-equipment-matrix.git
git branch -M main
git push -u origin main
```

---

## Step 5: Enable GitHub Pages

**Time: 3 minutes**

1. In your GitHub repository, go to **Settings** (tab at the top)
2. In the left sidebar, click **Pages**
3. Under **Source**, select:
   - **Branch**: `main`
   - **Folder**: `/ (root)`
4. Click **Save**
5. Wait 1–2 minutes. GitHub will show your site URL:
   ```
   https://yourusername.github.io/test-equipment-matrix/
   ```
6. Click the URL — your app should load!

---

## Step 6: Handle the Config File on GitHub Pages

Since `sync-config.js` is in `.gitignore` and not uploaded, the app hosted on GitHub Pages won't have it. There are two ways to handle this:

### Option A: Create a separate config file on GitHub (recommended for testing)

Since this is a test setup, you can create a `sync-config.js` directly on GitHub:

1. In your repo on GitHub, click **Add file → Create new file**
2. Name it: `js/sync-config.js`
3. Paste your config (with real credentials)
4. Commit

> **Note:** If the repo is **private**, only you (and collaborators) can see the API key. For a public repo, see Option B.

### Option B: Use URL parameters (safer for public repos)

The app can read credentials from the URL instead. Add this to the top of `sync.js` (before `init()`):

```javascript
// Read config from URL: ?bin=XXXX&key=XXXX
const params = new URLSearchParams(window.location.search);
if (params.get('bin') && params.get('key')) {
    window.SYNC_CONFIG = {
        BIN_ID: params.get('bin'),
        API_KEY: params.get('key'),
        ENABLED: true
    };
}
```

Then share the URL with colleagues like:
```
https://yourusername.github.io/test-equipment-matrix/?bin=YOUR_BIN_ID&key=YOUR_API_KEY
```

---

## Step 7: Share with Colleagues

**Time: 1 minute**

Send your colleagues the GitHub Pages URL. When they open it:

1. The app loads in their browser
2. Sync pulls the latest data from JSONbin (green dot appears)
3. Any changes they make are pushed back to JSONbin
4. Other users see the changes within 30 seconds (auto-poll)

**That's it — you're live!**

---

## Limitations of This Test Setup

This is intentionally a lightweight test setup. Be aware of:

| Limitation | Impact | Production fix |
|---|---|---|
| JSONbin free tier: 10K requests/month | Fine for 2–5 users testing | SharePoint Lists (unlimited for your org) |
| No user authentication | Anyone with the URL+key can edit | Azure AD login |
| Last-write-wins conflicts | If two people edit simultaneously, last save wins | SharePoint handles per-field conflicts |
| No change history | Can't see who changed what | SharePoint + ChangeLog list |
| API key in config file | Must keep repo private or use URL params | Azure AD tokens (no stored keys) |

These are all solved by the Azure AD + SharePoint approach we discussed — this test just proves the concept works.

---

## Troubleshooting

**Grey dot — "Local only — no sync configured"**
- `sync-config.js` is missing or has placeholder values
- Check that the file is loaded in the browser (F12 → Console → look for `[Sync]` messages)

**Red dot — "Pull failed: HTTP 401"**
- Your API key is wrong. Go to JSONbin Dashboard → API Keys and re-copy

**Red dot — "Pull failed: HTTP 404"**
- Your Bin ID is wrong. Go to JSONbin Dashboard → Bins → click your bin → check the URL

**Data not syncing between users**
- Both users must have the same Bin ID and API Key
- Check that both see a green dot
- Try clicking the status pill (forces a manual sync)

**Changes lost after refresh**
- Make sure you're not loading a cached version. Try Ctrl+Shift+R (hard refresh)
- Check the console for `[Sync] Pull` / `[Sync] Push` messages

---

## File Changes Summary

Files **added** (new):
- `js/sync.js` — Remote sync manager (JSONbin integration)
- `js/sync-config.js` — Your credentials (DO NOT commit to public repos)
- `.gitignore` — Excludes sync-config.js from git

Files **modified**:
- `index.html` — Added `<script>` tags for sync-config.js and sync.js
- `flow.html` — Added `<script>` tags for sync-config.js and sync.js
- `js/app.js` — Added SyncManager.init() and push after save
- `js/flow-app.js` — Added SyncManager.init() and remote update listener
- `js/flow-data.js` — Added SyncManager.push() after FlowData.save()
