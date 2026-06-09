# CTPBL v2 — Architecture

**Status:** Draft for review.
**Audience:** Ben + future contributors.
**Companion docs (produced by discovery agents, referenced by section below):** backend inventory, frontend inventory, Firestore schema.

Once approved, foundational decisions (stack, data store, auth provider, monorepo layout, schema shape) hold unless we find a real problem with them — we don't re-debate settled choices for preference reasons alone. Everything else (component details, field names, page layouts, new features, bug fixes in the plan) stays fluid and gets revised as we build.

---

## 1. Stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | **SvelteKit** on Cloudflare Pages | Component reuse for growing UI; SSR at the edge; lightweight runtime; native Cloudflare adapter. |
| API | **Firestore SDK** (client) + **Cloudflare Workers** for anything not appropriate from client | Most reads happen direct-to-Firestore via security rules. Workers only for tasks that need secrets (DUPR push, Telegram). |
| Data | **Firestore** (Native mode), region `us-east1` | Source of truth. Strongly consistent reads, real-time listeners, free-tier generous. |
| Auth | **Firebase Auth**, Google provider | One-click sign-in. Authorization resolved from `users` collection into custom claims on token mint. |
| Background | **Cloud Functions for Firebase** (gen 2) | Aggregate maintenance, notifications, DUPR push, audit log enrichment. |
| Hosting domain | `ctpbleague.com` (apex) on Cloudflare Pages | Replaces the current Worker that serves `public/`. |

**What we are deliberately *not* using:**
- Google Apps Script (retired at cutover)
- Google Sheets as source of truth (sheet becomes a one-shot export target, optional)
- PIN-based auth, email-only verify (replaced by Firebase Auth)
- Cloudflare KV cache (Firestore + edge SSR is fast enough)

---

## 2. Repository layout

New repo: **`ctpbleague-v2`** (separate from this repo).

```
ctpbleague-v2/
├── apps/
│   └── web/                     # SvelteKit app (deployed to Cloudflare Pages)
│       ├── src/
│       │   ├── lib/
│       │   │   ├── components/  # ~25 reusable Svelte components
│       │   │   ├── stores/      # auth, current season, theme
│       │   │   ├── firebase/    # client SDK init, typed wrappers
│       │   │   └── theme/       # tokens, css vars
│       │   ├── routes/          # file-based routing
│       │   └── app.html
│       ├── svelte.config.js
│       └── wrangler.toml
├── functions/                   # Cloud Functions (TypeScript)
│   ├── src/
│   │   ├── aggregates/          # standings, player stats, pairing stats
│   │   ├── notifications/       # email, telegram
│   │   ├── dupr/                # platform push + flush
│   │   ├── audit/               # write helpers
│   │   └── auth/                # onCreate → custom claims
│   └── package.json
├── firestore/
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   └── rules.test.ts
├── scripts/
│   └── migrate-sheet-to-firestore.ts   # one-shot importer
├── firebase.json
├── .firebaserc
└── README.md
```

Monorepo via npm workspaces. No Turborepo / Nx — overkill for two apps.

---

## 3. Firestore schema (summary)

Full design lives in the discovery agent's output; below is the canonical shape we are building.

### Top-level collections

| Collection | Doc id | Purpose |
|---|---|---|
| `seasons` | `season_id` | Season records (active/closed). |
| `divisions` | `division_id` | League tiers. |
| `clubs` | `club_id` | Parent orgs. |
| `teams` | `team_id` | Team entries; carries `club_id`, `division_id`, denormalized `club_name`. |
| `players` | `player_id` | Player registry. |
| `users` | Firebase Auth `uid` | Authorization. Single doc per user, **roles as array**. Email indexed for lookup. |
| `matches` | `match_id` | Schedule + result rollup; denormalized team + club names. |
| `standings` | `{season_id}_{division_id}` | Materialized standings — one doc per (season, division), all teams inside. |
| `playerStats` | `{season_id}_{player_id}` | Materialized per-player season stats. |
| `pairingStats` | `{season_id}_{team_id}_{p1}_{p2}` | Partner combination history. |
| `auditLog` | auto | Append-only writes log. |
| `requests` | `request_id` | Feedback / bug submissions. |
| `branding` | singleton `meta` | League + club logo URLs. |
| `matchFormatTemplates` | `template_id` | Round/game template per division. |
| `lineupValidationRules` | `rule_id` | Per-division validation constraints. |

### Sub-collections (under `matches/{match_id}`)

| Sub-collection | Doc id | Purpose |
|---|---|---|
| `rounds` | `round_id` | Round summaries within a match. |
| `games` | `game_id` | Individual games. Denormalizes player + team names at write time. |
| `submissions` | `team_id` | Per-team lineup submission state. |
| `availability` | `player_id` | Per-player active flag for this match. |

### Denormalization policy

- **Names frozen at write time** in `games` (player_1_name, player_2_name) and `matches` (home_team_name, away_team_name) — preserves historical accuracy and avoids joins on every read.
- **Standings and stats are materialized**, never computed at read. Cloud Functions rebuild them on game completion.
- **Player rename** triggers a one-shot re-denormalization function (rare; admin-triggered).

### Real-time listeners (vs one-shot reads)

| Page | Strategy |
|---|---|
| Live Scoreboard, Match Display, Scorecard entry | `onSnapshot` on `matches/{id}` and games sub-collection |
| Home, Matches, Standings, Player Page, Players Directory, Season Stats | One-shot `getDoc`/`getDocs` cached by SvelteKit `load` |
| Captain portal | One-shot read on entry, write triggers re-fetch |

### Read cost projection

At projected scale (10 clubs, 40 teams, 400 players, 50 matches/week, 4 seasons): **~7.3k reads/day** for ~500 weekly visitors. Free tier (50k/day) accommodates 6x growth.

### Indexes

Composite indexes required (added to `firestore.indexes.json`):
- `matches` by `(season_id, division_id, match_date)`
- `matches` by `(season_id, status, match_date)`
- `users` by `email` (single-field, automatic)
- `playerStats` by `(season_id, division_id, wins desc)` for MVP leaderboard

---

## 4. Auth + authorization

### Flow

1. User clicks "Sign in with Google" anywhere in the app.
2. Firebase Auth handles OAuth, returns ID token.
3. **`onUserCreate` Cloud Function** (or callable on first sign-in) looks up email in `users` collection and writes **custom claims**: `{ roles: ['captain'], teamIds: ['T1','T2'], clubIds: ['C1'], isCommissioner: false, isDirector: false }`.
4. Token refreshes get new claims when admin updates `users` doc (admin function force-revokes & re-mints).
5. Security rules check claims directly — no extra reads to authorize a write.

### `users` doc shape (replaces sheet's multi-row pattern)

```json
{
  "uid": "firebase-auth-uid",
  "email": "captain@example.com",
  "fullName": "Jane Doe",
  "active": true,
  "roles": ["captain", "director"],
  "teamIds": ["TEAM_A", "TEAM_B"],
  "clubIds": ["CLUB_X"],
  "isCommissioner": false,
  "createdAt": "...",
  "updatedAt": "..."
}
```

If a user has captain + director roles, they're one doc, `teamIds` and `clubIds` populated accordingly. `isCommissioner` is a top-level bool because it grants unrestricted access.

### Security rules (sketch)

```
match /matches/{m} {
  allow read: if true;
  allow update: if isCommissioner();

  match /games/{g} {
    allow read: if true;
    allow update: if isScorecardActor()
                  || isCaptainOnMatch(m)
                  || isCommissioner();
  }

  match /submissions/{teamId} {
    allow read: if isVisibleOrCaptainOnMatch(m, teamId) || isCommissioner();
    allow write: if hasTeamAccess(teamId) || isCommissioner();
  }
}

match /users/{uid} {
  allow read: if request.auth.uid == uid || isCommissioner();
  allow write: if isCommissioner();
}

match /standings/{id}    { allow read: if true; allow write: if false; }
match /playerStats/{id}  { allow read: if true; allow write: if false; }
// ... aggregates only writable by Cloud Functions (service account bypasses rules)
```

---

## 5. Cloud Functions

### Aggregate maintenance (Firestore triggers)

| Function | Trigger | Output |
|---|---|---|
| `onGameWrite` | `matches/{m}/games/{g}` write | Recompute round winner, match winner if last game; cascades to `onMatchComplete`. |
| `onMatchComplete` | `matches/{m}` update where `winning_team_id` set | Rebuild `standings/{season}_{division}` doc. |
| `onGameComplete` | `matches/{m}/games/{g}` update where status = completed | Upsert `playerStats` for 4 players; upsert `pairingStats` for 2 pairings. |
| `onPlayerRename` | `players/{p}` update where name changed | Re-denormalize names in recent matches (rate-limited). |

### Side-effect functions (HTTP or trigger)

| Function | Trigger | Purpose |
|---|---|---|
| `onLineupSubmitted` | `matches/{m}/submissions/{t}` update where `officially_submitted` flipped | Email opposing captains, directors, commissioners. Telegram broadcast. |
| `onGameScoreRecorded` | `matches/{m}/games/{g}` update where status flips to completed | DUPR push (if configured), audit log enrichment. |
| `onUserCreate` | Auth user create | Hydrate custom claims from `users` collection email lookup. |
| `onPlayerRegister` | `players` doc create with `source: 'public-registration'` | Notify commissioners by email. |

### Callable functions

| Function | Caller | Purpose |
|---|---|---|
| `refreshAggregates` | Admin UI | Force rebuild of all standings/stats. Admin-only. |
| `revokeUserClaims` | Admin UI when users doc edited | Force token re-mint with new claims. |

---

## 6. Frontend

### Routing (SvelteKit file-based)

```
src/routes/
├── +layout.svelte                    # AppHeader + AppSidebar
├── +page.svelte                      # Home
├── matches/
│   ├── +page.svelte                  # Matches list (group by week/division)
│   └── [matchId]/
│       ├── +page.svelte              # Match detail (preview/live/final auto-select)
│       ├── scoreboard/+page.svelte   # Live scoreboard
│       ├── report/+page.svelte       # Final report
│       └── display/+page.svelte      # 4K display view
├── standings/+page.svelte
├── season-stats/[division]/+page.svelte
├── players/
│   ├── +page.svelte                  # Directory
│   └── [playerId]/+page.svelte       # Player page
├── rules/+page.svelte
├── feedback/+page.svelte
├── register/+page.svelte
├── (admin)/                          # route group, layout enforces commissioner
│   ├── admin/+page.svelte
│   ├── requests/+page.svelte
│   └── dupr/+page.svelte
├── (captain)/                        # route group, layout enforces captain access
│   ├── captain/[matchId]/[teamId]/+page.svelte
│   └── scorecard/[matchId]/+page.svelte
└── login/+page.svelte
```

### Component inventory (27 components)

Full list in the frontend discovery doc. Categories:

- **Layout (3):** AppHeader, AppSidebar, NavigationItem
- **Forms (5):** FormInput, FormSelect, FormRadioGroup, FormTextarea, FormRow
- **Data display (8):** MatchCard, PlayerCard, StandingsTable, LeaderboardRow, StatCard, GameRow, TypePill, SectionHeader
- **Feedback/admin (4):** RequestCard, StatusSelect, Toast, RegistrationStep
- **Overlays (3):** Modal, Backdrop, Drawer
- **Utility (4):** LoadingState, EmptyState, Badge, GenderBadge

### Design tokens

Migrated from current `public/styles.css`. Single source of truth in `src/lib/theme/tokens.css`:

```css
:root {
  --league-navy:  #081f43;
  --league-blue:  #123a7c;
  --league-green: #0b7e39;
  --league-gold:  #ffd22e;
  --female:       #ef4f8b;
  --male:         #1f7cff;
  --mixed:        #6c4bff;
  /* ... full token set ported from styles.css ... */
}
```

Fonts: DM Sans (body), Bebas Neue (display), DM Mono (numeric data) — same as current.

---

## 7. Migration plan

### Phase order (matches task list)

1. ✅ Discovery (this doc)
2. ⬜ Repo + Firebase project + SvelteKit skeleton
3. ⬜ Firestore schema + rules + indexes deployed
4. ⬜ Migration script: Sheet → Firestore (one-shot, re-runnable)
5. ⬜ Auth + component library (parallel)
6. ⬜ Public read pages (parallel: Home / Matches / Standings / Players / Stats / Player page)
7. ⬜ Cloud Functions (aggregates, notifications)
8. ⬜ Write modules (Captain, Scorecard, Admin, Display)
9. ⬜ Registration + Feedback
10. ⬜ Side-by-side validation
11. ⬜ Hard cutover: DNS swap, retire GAS

### Cutover strategy

- v2 lives at **`v2.ctpbleague.com`** during build (Cloudflare Pages preview domain).
- Migration script runs nightly during build phase to keep v2 Firestore in sync with prod Sheet (read-only mirror).
- Cutover day: stop the sync, run final migration, swap DNS, monitor.
- GAS deployments archived but not deleted for 30 days post-cutover.

### Things we keep (don't rewrite)

- League branding assets (logos in Drive)
- DUPR platform integration URL + key (move to Cloud Function env)
- Telegram bot token + chat ID (move to Cloud Function env)
- League rules PDF (move to Pages static asset)

### Things we drop

- PIN auth
- Email-only verify endpoint
- `?page=X` URL pattern (replaced by SvelteKit routes)
- Iframe-based hub composition
- CacheService (replaced by Firestore native + SvelteKit cache)

---

## 8. Open questions for sign-off

Items I've made a call on but want explicit ack before building:

1. **SvelteKit, not Next/vanilla.** Confirmed in chat.
2. **Firestore as source of truth, sheet retired.** Confirmed in chat.
3. **Firebase Auth Google sign-in only — no email magic link, no PIN.** Captains and commissioners must have Google accounts. Confirmed implied; flag if any league user lacks a Google account.
4. **Hard cutover with parallel build at v2.ctpbleague.com.** Confirmed in chat.
5. **Monorepo with `apps/web` + `functions/` + shared `firestore/`** vs separate repos. **Going monorepo** — easier shared schema types between client and functions.
6. **No backwards compatibility with GAS URLs.** Old `?page=captain` links break at cutover. Acceptable since the league is small and we can communicate the change.
7. **Region `us-east1`.** Closest to Connecticut.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Aggregate function bugs corrupt standings | Recompute-all callable; all writes audit-logged; aggregates idempotent. |
| Cutover during active season | Schedule cutover for off-week or between seasons. |
| User without Google account can't sign in | Fallback: commissioner creates Firebase Auth user manually with provided email; user receives password-reset link to set password. |
| Firestore free-tier exceeded | Monitor reads in console; tighten listener scope; Blaze plan is ~$10/mo at 5x current scale. |
| DUPR push regression | Cloud Function logs every push attempt; CSV export remains as manual fallback. |

---

## 10. What approval looks like

You read this and respond with:
- "Approved" — I close task #2 and start task #3 (repo creation).
- "Approved with changes: X, Y, Z" — I update this doc and re-confirm.
- Questions — I answer, you re-read.

No code gets written for v2 until this is signed off.
