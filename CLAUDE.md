# CPBL — Connecticut Pickleball League

Project orientation for Claude Code. Read this first at the start of every session.

---

## What this is

A league management website for the Connecticut Pickleball League. Backend is Google Apps Script reading/writing a single Google Sheet. Frontend is a mix of GAS-served HTML pages and a Cloudflare Pages hub that ties them together at **ctpbleague.com**.

---

## Quick reference

| Thing | Value |
|---|---|
| Domain | https://ctpbleague.com |
| Cloudflare Worker | https://morning-wind-da2a.bkochanski.workers.dev |
| GAS test deployment | https://script.google.com/macros/s/AKfycbwvAFHiqHp5F44JWma3iTlRlweB_x5wGXy-Rru3BYg/dev |
| GAS script ID | `18khk-KdiA9q9grnlJN63vnM2SPnHrcFXBtXWff0JnT7HphrsDhWKbWTs` |
| Google Sheet | https://docs.google.com/spreadsheets/d/1DRiZ-xraXY9J1Bp09U3Rxg0qx943Apj8guBy1fd5jJ8/edit |
| Git repo | https://github.com/benkochanski/ctpbleague |
| Local working dir | `/Users/BenKochanski/CPBL` |

---

## Architecture

- **Backend:** Google Apps Script. Single script project, all `.gs` files live alongside the HTML in the same flat directory.
- **Data store:** One Google Sheet with many tabs serving different purposes (raw data, config, computed views, lookup tables).
- **GAS-served pages:** HTML files served via `doGet()` in `Web.js` — these are the modules that need backend writes (`google.script.run`) like Captain/Lineups, Scorecard, Display.
- **Public hub:** Cloudflare Pages site at `ctpbleague.com`, with a Worker fronting it. Hub provides shared chrome (sidebar nav, header, admin gate) and either iframes the GAS pages or hosts native pages that fetch JSON from a GAS endpoint.

### Iframing GAS pages
Any GAS HTML that needs to load inside the hub iframe must set:
```js
.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
```
in its `doGet` route. Pages that lack this open in a new tab instead.

---

## File layout

All files live flat in `/Users/BenKochanski/CPBL` — no subdirectories. The `public/` folder (if present) holds the Cloudflare Pages hub assets.

Typical files:
- `Web.js` — GAS router (`doGet`), the spine of the GAS deployment
- `*.html` — one per module (Captain, Scorecard, SeasonStats, PlayerPage, PlayersDirectory, PublicScoreboard, MatchDisplay, GameReport, etc.)
- `*.js` (server-side `.gs`) — backend functions called via `google.script.run`
- `appsscript.json` — GAS manifest
- `public/index.html`, `public/styles.css`, `public/app.js` — Cloudflare hub shell

---

## Workflow with Claude

Claude handles all pushes, pulls, and deployments. Default loop:

1. **Pull latest** from GAS before editing: `clasp pull`
2. Edit files locally
3. **Push** to GAS test deployment: `clasp push`
4. Test against the dev URL
5. Commit and push to GitHub when stable
6. For hub changes, Cloudflare Pages auto-deploys on git push

Use `clasp` (already configured in this directory) for GAS sync. Use `git`/`gh` for repo work.

---

## Module status

| Module | Status | Notes |
|---|---|---|
| Player directory | **OFFLINE** | Was fully operational, hit issues — needs debugging |
| Division stats | Done | Possible minor edits |
| Player stats | Early dev | |
| Scorekeeping | Done | |
| Lineup submission | Mostly done | Authentication still TBD |
| Display scoreboard | Mostly done | |
| Full scorecard | Not started | |

---

## Hub shell (Cloudflare Pages)

Single-page hub with collapsible sidebar nav. Admin section is passcode-gated (client-side only — Cloudflare Access is the planned production gate).

**Nav structure (target):**
```
LEAGUE (public)
  Home
  Schedule & Scores
  Standings
  Season Stats
  Players
  Live Scoreboard
  Game Reports

ABOUT (public, static)
  Rules           ← from PDF
  Registration    ← Google Form embed

LEAGUE OPS (admin-gated)
  Captain / Lineups
  Match Display
  Scorekeeping
```

Schedule, Scores, Standings, Rules, and Registration are **planned but not yet built** as of last session.

---

## Design tokens

Pulled from existing CPBL apps — palette is consistent across Captain, Scorecard, SeasonStats, etc.

```css
--navy: #081f43;
--blue: #123a7c;
--green: #0b7e39;
--gold: #ffd22e;
```

Header uses navy → blue → green gradient with gold accent. Fonts: **DM Sans** (body), **Bebas Neue** (display).

---

## Sheet structure

> _Fill in tab names and purposes here as we re-confirm them. Many tabs, used in many ways — raw data, config, computed views, lookup tables._

Tabs include (incomplete):
- Matches
- (others — TBD)

---

## Known issues / current priorities

1. **Player directory regression** — was working, now offline. Likely first thing to fix.
2. **Lineup submission auth** — needs a real auth strategy (captain identity verification).
3. **Hub buildout** — Schedule, Scores, Standings, Rules (from PDF), Registration (Google Form embed) still to build.
4. **Iframe blockers** — confirm `ALLOWALL` is set on every GAS page that should embed in the hub.

---

## Auth strategy

**Approach: Google Identity Services (GIS) on the client + token verification on the server.**

The league has no sensitive data — auth is just administrative control + tracking who edited what. The flow:

1. Single GAS deployment, "Execute as: Me / Anyone, even anonymous". One URL, no deployment-level sign-in.
2. Captain.html (and Scorecard.html, when added) embed Google's GIS button. The captain clicks it → Google signs them in → returns a signed JWT (the "ID token") to the page.
3. The page stores the token in `window.cpblIdToken` and passes it as the first argument of every `google.script.run.x(...)` write call.
4. Backend handlers call `requireCaptainAccess_(idToken, teamId)` from [Auth.js](Auth.js):
   - `verifyGoogleIdToken_()` hits `https://oauth2.googleapis.com/tokeninfo?id_token=...` to validate the signature, issuer, audience (our OAuth client ID), and expiry. Throws if any check fails.
   - `getCaptainAccessForEmail_()` looks up the verified email in `Users` + `User_Access`, expands director→teams, returns the allowed team list.
   - Throws if the user isn't authorized for the team.
5. Every successful write is appended to `Audit_Log` via `appendAuditLog_({ access, entityType, entityId, actionType, newValueJson })`.

**OAuth Client ID** (already created): `250461385382-o1jcqvvkom51s3l8qim8te5frr3ju52h.apps.googleusercontent.com`. Stored as `GOOGLE_OAUTH_CLIENT_ID` in [Config.js](Config.js). To regenerate, see Google Cloud Console → APIs & Services → Credentials.

**Authorized JavaScript origins** for the OAuth client (must include the page that hosts the GIS button):
- `https://script.google.com`
- `https://docs.google.com`
- `https://*.googleusercontent.com` (the Apps Script iframe sandbox)
- `https://live.ctpbleague.com`, `https://ctpbleague.com`
- `https://*.bkochanski.workers.dev` (Cloudflare preview URLs)

**Authorization data lives in the sheet:**
- `Users` tab: `user_id`, `email`, `name`, `active` — one row per person who can sign in.
- `User_Access` tab: `user_id`, `role_type` (`captain` | `director` | `commissioner`), `team_id` (captain), `club_id` (director), `active`.
- Director rows expand to all teams in the named club.

**To add a captain:**
1. Add a row to `Users` (`active=TRUE`, email matches their Google account).
2. Add a row to `User_Access` with `role_type=captain` + their `team_id`.

**Audit log:** writes are recorded in the `Audit_Log` sheet (schema in [Schema.js](Schema.js): `audit_id`, `entity_type`, `entity_id`, `action_type`, `old_value_json`, `new_value_json`, `changed_by_user_id`, `changed_at`, `reason`). If the sheet doesn't exist as a tab yet, create it with that header row — `appendAuditLog_()` silently skips if the sheet is missing.

**Hub:** the client-side passcode gate (`cpbl2026`) in [public/app.js](public/app.js) still hides the admin nav as a courtesy. Real enforcement is server-side now via the GIS token check. Captain + Scorecard are iframed (no need for new-tab — GIS works inside iframes).

---

## Conventions

- Don't reorganize the flat file layout without discussion — it's intentional for GAS compatibility.
- Read-only data views should be native Cloudflare pages fetching JSON from a GAS endpoint (faster, no Google iframe chrome). Modules with writes stay on GAS.
- Confirm before deploying anything that touches public-facing pages.
- The passcode gate on the admin section is a placeholder — production should use Cloudflare Access.
