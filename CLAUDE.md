# CPBL — Connecticut Pickleball League

Project orientation for Claude Code. Read this first at the start of every session.

---

## What this is

A league management website for the Connecticut Pickleball League. Backend is Google Apps Script reading/writing a single Google Sheet. Frontend is a mix of GAS-served HTML pages and a Cloudflare Pages hub that ties them together at **ctpbleague.com**.

---

## Quick reference

| Thing | Value |
|---|---|
| **Live hub URL** | **https://ctpbleague.com** |
| Alternate hub URL (also bound to the Worker) | https://live.ctpbleague.com |
| Cloudflare Worker | `morning-wind-da2a` (serves `public/` as static assets via `wrangler.jsonc`) |
| Worker preview URL | https://morning-wind-da2a.bkochanski.workers.dev |
| GAS prod deployment ID (what the hub iframes) | `AKfycbzuzujnOWumYMPb64hQw6LCiAGPVqDd79WnBQa8X6ZabAxrNUhVVAHfHYJnCKvxlBvD` |
| GAS prod URL | `https://script.google.com/macros/s/AKfycbzuzu.../exec` |
| GAS staging deployment ID | `AKfycbzjVryG88l3GHDqTglfeB9UmN8Ju6VYU_YVADWCwdMi5WQhomJhFramhpg1MZQHZKy-` |
| GAS staging URL | `https://script.google.com/macros/s/AKfycbzjVryG88l3GHDqTglfeB9UmN8Ju6VYU_YVADWCwdMi5WQhomJhFramhpg1MZQHZKy-/exec` |
| GAS test/dev URL (always reflects last `clasp push`) | https://script.google.com/macros/s/AKfycbwvAFHiqHp5F44JWma3iTlRlweB_x5wGXy-Rru3BYg/dev |
| GAS script ID | `18khk-KdiA9q9grnlJN63vnM2SPnHrcFXBtXWff0JnT7HphrsDhWKbWTs` |
| Google Sheet | https://docs.google.com/spreadsheets/d/1DRiZ-xraXY9J1Bp09U3Rxg0qx943Apj8guBy1fd5jJ8/edit |
| Git repo | https://github.com/benkochanski/ctpbleague |
| Local working dir | `/Users/BenKochanski/CPBL` |
| Active branch | **`main` only** — no worktrees, no feature branches |

### DNS

Both `ctpbleague.com` (apex) and `live.ctpbleague.com` are bound as Custom Domains on the `morning-wind-da2a` Worker — both serve the hub. The apex is the canonical URL; `live.` is kept around so old links don't break.

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

### JSON fetch endpoints (bypass `google.script.run` deadlock)

Inside an iframe, `google.script.run` can deadlock Chrome during sign-in. To avoid this, several routes return raw JSON via `ContentService` so the page can call them with plain `fetch()`:

- `?page=verifyemail&email=…` — runs `verifyPortalEmail(email)`, returns `{ok, userId, name, allowedTeamIds, isCommissioner, …}`
- `?page=openmatches` — list of open matches for score entry
- `?page=scorecarddata&matchId=…` — full scorecard payload for one match
- `?page=scorebranding` — club logos/colors for the scorecard chrome
- `?page=admin` — Admin landing page (HTML, not JSON, but uses the fetch flow)

The HTML routes (`captain`, `scorecard`, `display`, `admin`) inject `gasExecUrl = ScriptApp.getService().getUrl()` into the template so client JS can build absolute fetch URLs:

```js
const t = HtmlService.createTemplateFromFile('Captain');
t.gasExecUrl = ScriptApp.getService().getUrl();
return t.evaluate().setXFrameOptionsMode(...);
```

Client-side reads it via `<?!= JSON.stringify(gasExecUrl) ?>` into `window.__GAS_EXEC_URL__`.

---

## File layout

All files live flat in `/Users/BenKochanski/CPBL` — no subdirectories. The `public/` folder (if present) holds the Cloudflare Pages hub assets.

Typical files:
- `Web.js` — GAS router (`doGet`), the spine of the GAS deployment. Owns the `?page=…` route table and template-variable injection (e.g. `gasExecUrl`).
- `Admin.html` — landing page; signs the user in once and hands the access blob to other modules via `localStorage.cpbl_admin_email`.
- `Captain.html`, `Scorecard.html`, `MatchDisplay.html`, `PublicScoreboard.html`, `SeasonStats.html`, `PlayerPage.html`, `PlayersDirectory.html`, `GameReport.html`, `RequestForm.html`, `RequestAdmin.html` — the modules.
- `Auth.js` — `resolveAccessByEmail_`, `verifyPortalEmail`, `requireCaptainAccess_`, `appendAuditLog_`.
- `Schema.js`, `Config.js` — sheet schemas + constants. `ensureSchema_()` idempotently creates/repairs tabs.
- `Matches.js`, `Lineups.js`, `Submissions.js`, `ScorecardGS.js`, `Standings.js`, `MatchGamesBuilder.js`, `Templates.js`, `Validation.js`, `Utils.js`, `Branding.js`, `ActivePlayers.js`, `PlayerPageGS.js`, `PlayersDirectoryJS.js`, `PublicViews.js`, `Requests.js`, `SeasonStatsJS.js`, `SeedTestData.js`, `sandbox.js` — backend logic.
- `appsscript.json` — GAS manifest.
- `public/index.html`, `public/styles.css`, `public/app.js`, `wrangler.jsonc` — Cloudflare hub shell.

---

## Workflow with Claude

**Single branch, single working directory.** All work happens in `/Users/BenKochanski/CPBL` on the `main` branch. No worktrees, no feature branches. Edit → commit → push.

There are **two systems** that need publishing separately:

### Hub changes (anything in `public/` or `wrangler.jsonc`)
1. Edit files
2. `git add … && git commit -m "…"`
3. `git push origin main` — Cloudflare auto-rebuilds the Worker, `ctpbleague.com` updates within ~1 min

### GAS changes (anything else: `*.js`, `*.html`, `appsscript.json`)
1. Edit files (or `clasp pull` first if the GAS console was edited directly)
2. `clasp push` — uploads to GAS at `@HEAD`. Test URL updates instantly.
3. **Test on dev URL first** (`/dev` — updates instantly on push, no deploy needed)
4. **When ready to test stably**, deploy to staging: `clasp deploy --deploymentId AKfycbzjVryG88l3GHDqTglfeB9UmN8Ju6VYU_YVADWCwdMi5WQhomJhFramhpg1MZQHZKy- --description "…"` — test at the staging URL without touching prod
5. **When confirmed good**, deploy to prod: `clasp deploy --deploymentId AKfycbzuzujnOWumYMPb64hQw6LCiAGPVqDd79WnBQa8X6ZabAxrNUhVVAHfHYJnCKvxlBvD --description "…"` — publishes to the hub

### Promote an exact staging version to prod (no new code)

If you just want to ship the staging version as-is without redeploying current `@HEAD`, pin prod to a specific version:

```
clasp deploy --versionNumber <N> --deploymentId AKfycbzuzu… --description "Promote staging vN to prod"
```

This is the cleanest "push staging to production" path — no risk of including uncommitted local edits.

### Both
1. Commit to git as well so the GAS code stays mirrored on GitHub
2. `git push origin main`

> ⚠️ **Keep git in sync with GAS HEAD.** It's tempting to `clasp push` for a quick test and skip the git commit. Don't — the repo silently drifts behind GAS, and `git diff` starts showing "additions" for code that's already live in production. After every `clasp push` that you intend to keep, also stage + commit the same files so `git log` reflects what's actually deployed.

> ⚠️ Pushing to `main` updates production. The session sandbox blocks direct pushes to `main` unless explicitly authorized — ask the user "ok to push to main?" before running `git push origin main` or `clasp deploy`.

---

## Module status

| Module | Status | Notes |
|---|---|---|
| Hub (Cloudflare Worker) | Live | Matches page, Home, sticky header, league date/time overrides — all on `main` |
| Player directory | Live | `Web.js` `?page=players` route has `ALLOWALL`; loads inside hub iframe |
| Season Stats (Division stats) | Live | Hero corner dropdown + right-side schedule layout |
| Player stats | Early dev | |
| Admin landing | Live | Single sign-in entry; hands access blob to Captain/Scorecard via `localStorage.cpbl_admin_email` |
| Lineup submission (Captain) | Live | Email-only sign-in via `?page=verifyemail` fetch; auto-resumes from admin handoff or sessionStorage |
| Scorekeeping (Scorecard) | Live | Any registered user can keep score; saves record actor on `Match_Games.score_entered_by_user_id` + `Audit_Log` |
| Display scoreboard | Live | Auto-picks current week; 4K wide-rail with Other Matches + Division Stats |
| Public Scoreboard | Live | Deep-linked from match-cell clicks on Home/Matches via `?page=scoreboard&matchId=…` |
| Full scorecard | Not started | |
| Feedback / Bug reports | Live | `?page=request` (form) + `?page=requestadmin` (admin manager) |
| Rules & Handbook | Stub | Hub nav entry exists; native page not yet built |

---

## Hub shell (Cloudflare Pages)

Single-page hub with collapsible sidebar nav. Admin section is passcode-gated (client-side only — Cloudflare Access is the planned production gate).

**Current nav structure** (defined in [public/index.html](public/index.html), routes wired in [public/app.js](public/app.js)):
```
LEAGUE (public)
  Home
  Matches
  Season Stats
  Players

ABOUT
  Rules           ← stub page, content not yet authored
  Feedback        ← iframes ?page=request

LEAGUE OPS (admin-gated)
  Admin           ← signs in once, hands off to Captain/Scorekeeping
  Match Display
```

Hidden routes (still callable for deep-links and bookmarks, but not in the sidebar):
- `captain` (`?page=captain`) — opens in new tab
- `scorecard` (`?page=scorecard`) — opens in new tab
- `scoreboard` (`?page=scoreboard&matchId=…`) — used by match-cell clicks on Home/Matches
- `gamereport` (`?page=gamereport&matchId=…`)
- `player` (`?page=player&playerName=…`)
- `registration` — placeholder, not implemented

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

Source of truth: `getSchemaMap_()` in [Schema.js](Schema.js). `ensureSchema_()` is idempotent — running it creates missing tabs and rewrites mismatched header rows.

**Config / lookup tabs:**
- `Divisions` — `division_id, division_name, division_order, match_template_id, active`
- `Clubs` — `club_id, club_name, short_name, logo_url, active`
- `Teams` — `team_id, team_name, club_id, division_id, active`
- `Users` — `user_id, full_name, email, active, pin, role_type, team_id, club_id` (one row per role assignment; see Auth strategy)
- `Players` — `player_id, first_name, last_name, full_name, gender, dupr, dupr_id, email, phone, active, notes`
- `Team_Rosters` — `roster_id, season_id, team_id, player_id, roster_status, available, active, start_date, end_date, notes`
- `Seasons` — `season_id, season_name, start_date, end_date, status`
- `Match_Format_Templates` — `template_row_id, match_template_id, round_number, round_type, game_number_in_round, game_type`
- `Lineup_Validation_Rules` — `rule_id, division_id, game_type, rule_name, rule_value, active`

**Match data tabs:**
- `Matches` — schedule + result rollups (`status, away_lineup_due_at, …, home_rounds_won, away_rounds_won, winning_team_id, …`)
- `Match_Rounds` — per-round summary (`round_id, match_id, round_number, round_type, …, status`)
- `Match_Games` — per-game scores; carries the `score_entered_by_user_id`/`score_entered_at` actor columns
- `Match_Submissions` — captain lineup submissions (`submission_status, is_visible_to_opponent, officially_submitted, …`)
- `Match_Player_Availability` — captain availability reports

**Computed / read-only views (regenerated by `refreshAllSummaries_`):**
- `Standings_Summary` — division standings rollup
- `Player_Stats_Summary` — per-player season stats
- `Pairing_Stats_Summary` — partner-pairing aggregates

**Operational tabs:**
- `Audit_Log` — append-only audit trail (`audit_id, entity_type, entity_id, action_type, old_value_json, new_value_json, changed_by_user_id, changed_at, reason`)
- `Requests` — bug/enhancement form submissions (see Feedback module)
- `README` — free-form notes (`section, notes`)

---

## Known issues / current priorities

1. **`www` subdomain** — `www.ctpbleague.com` returns 522 because the existing `CNAME www → ctpbleague.com` doesn't route through the Worker the way Custom Domains do. Add `www.ctpbleague.com` as a Custom Domain on the `morning-wind-da2a` Worker to fix.
2. **Rules page content** — nav entry exists but the page is a stub. Content lives in `CT_Pickleball_League_Handbook.pdf` and needs to be ported (or embedded) into a hub page.
3. **Iframe blockers** — when adding new GAS routes in `Web.js`, remember to set `.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)` on the `doGet` route, otherwise the page pops out of the hub iframe. For pages that need to call back into GAS via `fetch`, also set `t.gasExecUrl = ScriptApp.getService().getUrl()` on the template.
4. **GAS HEAD vs git drift** — clasp pushes don't auto-commit. After working on GAS-side files, always `git add` + `git commit` so the repo stays mirrored. If you ever see `git diff` showing large "additions" of code that's already running in production, that's the smell.
5. **Deployments** — 3 deployments listed by `clasp deployments`: prod (`AKfycbzuzu…`), staging (`AKfycbzjVryG…`), and the auto-managed test/dev (`AKfycbwvAFHi…@HEAD`). Don't add more — the dev/staging/prod split is enough.

---

## Auth strategy

**Approach: email-only sign-in via fetch + single-sheet authorization in the `Users` tab.**

The league has no sensitive data — auth is just administrative control + tracking who edited what. The flow:

1. Single GAS deployment, "Execute as: Me / Anyone, even anonymous". One URL, no deployment-level sign-in.
2. **Admin landing ([Admin.html](Admin.html))** is the canonical entry point. The user lands on `?page=admin`, types their email, the page POSTs to `?page=verifyemail&email=…` via plain `fetch`. The endpoint runs `verifyPortalEmail()` → `resolveAccessByEmail_()` and returns the full access blob `{ok, userId, name, allowedTeamIds, isCommissioner, isDirector, clubId, …}`.
3. **Admin stores the verified blob in `localStorage.cpbl_admin_email`** as JSON, then offers buttons that open `?page=captain` or `?page=scorecard` in new tabs.
4. **Captain / Scorecard auto-resume from the handoff.** On load they read `localStorage.cpbl_admin_email`; if the blob has `allowedTeamIds`/`isCommissioner` they trust it and skip re-verifying. Otherwise they fall through to the sessionStorage or `?userEmail=` paths and call `?page=verifyemail` themselves.
5. **Why fetch instead of `google.script.run`?** Inside a hub iframe, `google.script.run` can deadlock Chrome (the sandbox iframe waits for a response that never arrives). Direct `fetch` to the same `/exec` URL bypasses this — same auth, same backend, no deadlock.
6. Every successful write is appended to `Audit_Log` via `appendAuditLog_({ access, entityType, entityId, actionType, newValueJson, reason })`. Score saves and resets in [ScorecardGS.js](ScorecardGS.js) thread `actor = {userId, email, name}` through to the audit row.

### Authorization data — the `Users` sheet (single-sheet)

As of the May 2026 merge, `User_Access` is gone. All authorization lives in **one row per (user, role) pair** in the `Users` sheet:

| Column | Notes |
|---|---|
| `user_id` | Stable ID. Same user can have multiple rows (one per role/team/club assignment). |
| `full_name` | Display name |
| `email` | Lowercase, matches their Google account |
| `active` | `TRUE` / blank-treated-as-truthy |
| `pin` | Legacy — no longer used by current sign-in |
| `role_type` | `commissioner` \| `director` \| `captain` |
| `team_id` | For `captain` rows. Blank for `director`/`commissioner`. |
| `club_id` | For `director` rows; expands to all teams in that club. Optional for `captain` (club-scoped fallback). |

[Auth.js](Auth.js) `resolveAccessByEmail_()` filters all active rows for the email and folds them into a single access object. Director rows expand to club teams; commissioner rows grant unrestricted team access.

**To add a user:**
- **Captain:** one row with `role_type=captain` + `team_id=<their team>`.
- **Director:** one row with `role_type=director` + `club_id=<their club>` — they get every team in that club.
- **Commissioner:** one row with `role_type=commissioner` (no team/club needed).
- A user with multiple roles/teams gets multiple rows; access is the union.

### OAuth (legacy — kept for any future GIS use)

Client ID still in [Config.js](Config.js) as `GOOGLE_OAUTH_CLIENT_ID = '250461385382-o1jcqvvkom51s3l8qim8te5frr3ju52h.apps.googleusercontent.com'`. Authorized origins include `script.google.com`, `docs.google.com`, `*.googleusercontent.com`, `ctpbleague.com`, `live.ctpbleague.com`, `*.bkochanski.workers.dev`. Not currently exercised by the email-only flow, but available if we re-introduce ID-token verification later.

### Audit log

Writes go to the `Audit_Log` sheet (schema in [Schema.js](Schema.js): `audit_id`, `entity_type`, `entity_id`, `action_type`, `old_value_json`, `new_value_json`, `changed_by_user_id`, `changed_at`, `reason`). If the sheet doesn't exist, `appendAuditLog_()` silently skips — saves never fail because of audit-log issues.

### Hub gate

The client-side passcode in [public/app.js](public/app.js) still hides the admin nav as a courtesy. Real enforcement is server-side via the email→Users-sheet check on every write. Production should eventually move the courtesy gate to Cloudflare Access.

---

## Conventions

- Don't reorganize the flat file layout without discussion — it's intentional for GAS compatibility.
- Read-only data views should be native Cloudflare pages fetching JSON from a GAS endpoint (faster, no Google iframe chrome). Modules with writes stay on GAS.
- Confirm before deploying anything that touches public-facing pages.
- The passcode gate on the admin section is a placeholder — production should use Cloudflare Access.
