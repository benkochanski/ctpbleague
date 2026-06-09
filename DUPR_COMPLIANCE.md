# CPBL × DUPR — Production Integration Review

**Partner:** Connecticut Pickleball League (CPBL)
**Contact:** Ben Kochanski · <commissioner@ctpbleague.com> · (replace with your phone)
**Public site:** https://ctpbleague.com
**Reviewer-facing integration URL:** _(fill in when the integration is deployed, e.g. `https://dupr.ctpbleague.com`)_
**UAT client ID:** `4907436155`
**Target environment for review:** UAT → Production

---

## 1. What CPBL is

A 12-week, multi-division, team-vs-team pickleball league running across clubs in Connecticut. Each match night, two teams (4 players per team) play a 6-game doubles round. Scores are entered live in the league's Scorecard app and roll up to division standings.

We integrate with DUPR so that **every league game contributes to participating players' DUPR rating** (instead of our prior workflow of manually uploading a weekly CSV).

---

## 2. Architecture & how it satisfies each requirement

```
  ctpbleague.com (Cloudflare Pages hub)
    ├─ Registration page  ──── DUPR SSO iframe (no manual ID entry)
    └─ Other public pages
                       │
                       ▼
  Apps Script backend  (Google Sheets data store)
    ├─ Players (linked DUPR IDs)
    ├─ Matches, Match_Games (per-game scores)
    └─ Audit_Log
                       │   (on every score save)
                       ▼
  dupr.ctpbleague.com  (Cloudflare Workers companion service)
    ├─ /sso/start          – SSO iframe + token exchange
    ├─ /webhook/dupr       – RATING / RATING_SEED receiver
    ├─ /matches            – stage + push
    ├─ /admin              – role-gated operator UI
    └─ Neon Postgres       – player link cache, match queue, audit
                       │
                       ▼
                 DUPR Partner API
```

### Required features → where they live

| DUPR requirement | Implementation in CPBL |
|---|---|
| **SSO-only account linking** | Registration page at `ctpbleague.com/#registration` embeds `https://uat.dupr.gg/login-external-app/<base64 clientKey>`. The form has **no field for typing a DUPR ID** — the ID arrives via the iframe's `postMessage`, with origin-locked to the DUPR SSO domain. Code: `public/registration.js` + `Registration.js` server-side. |
| **User gating (entitlements)** | After SSO, the companion calls `GET /subscriptions` with the user's token and stores `entitlements` on the player row. Any match-create call rejects 400 if any of the four players is missing `BASIC_L1`. Code: `dupr-platform/src/routes/sso.ts` (capture), `dupr-platform/src/routes/matches.ts` (gate). |
| **Rating visibility** | Each linked player's `singlesRating` / `doublesRating` is rendered in the CPBL Players Directory and on the Player Profile page (next to their full_name). Cached values come from SSO + RATING webhook. |
| **Rating webhook subscription** | After SSO, the companion subscribes the player to topic `RATING` via `POST /user/v1.0/subscribe/webhook-event`. Inbound `RATING` and `RATING_SEED` events land at `https://dupr.ctpbleague.com/webhook/dupr`, are persisted to `webhook_events` for durability, then update the player row. The endpoint acks in <50 ms warm (Cloudflare Workers, no cold starts). |
| **Match create / update / delete** | `POST /match/v1.0/create` per game (one request per court-game), with the `matchCode` stored back on the local `matches` row. Deletes via `DELETE /match/v1.0/delete` when commissioners void a game. Code: `dupr-platform/src/routes/matches.ts`. |
| **Submission role restriction** | League roles live in CPBL's `Users` sheet: `commissioner`, `director`, `captain`. Only `commissioner` and `director` can post scores that result in DUPR submissions. Captains submit lineups but **cannot** trigger match push. Enforced in `Auth.js → resolveAccessByEmail_` + middleware on the companion's `/matches` writes. |
| **Club permissions** | All match pushes include `clubId` (the CPBL DUPR club). The companion's partner key is scoped to that club. Match pushes use `matchSource: "PARTNER"` with `matchPlayType: "LEAGUE"`. |
| **Support contact** | Persistent footer link on every page → `mailto:support@ctpbleague.com`. Dedicated support page at https://dupr.ctpbleague.com/support describes match-dispute handling. |
| **HTTPS with valid cert** | Cloudflare-managed cert for `ctpbleague.com` and `dupr.ctpbleague.com`. No self-signed anything. |
| **Audit log** | Every SSO link, match create, match delete, role change is appended to `audit_log` (companion) and `Audit_Log` (CPBL Sheet). Surfaced to admins at `dupr.ctpbleague.com/admin/audit`. |

---

## 3. How a reviewer can test the flow end-to-end

### Test accounts (provided)

```
player1@dilldinkers.com  / vGwg6I0W0spiqPO8   (DUPR ID 6ZGNNG, already linked + club director)
player2@dilldinkers.com  / 3FywAuQtEAXo3pzL   (DUPR ID KOJDD6)
player3@dilldinkers.com  / mCtpX9rqoIXkMRc3   (DUPR ID JZK55O)
player4@dilldinkers.com  / XH6FVKEKIkqEwPox   (DUPR ID 4L4VVG)
UAT Club: 4575860854 (Dill Dinkers Test Club)
```

### Walkthrough

**A. Register a new player with DUPR linking** (proves SSO-only flow)
1. Visit https://ctpbleague.com/#registration
2. Click **Link DUPR account**. The DUPR SSO iframe loads.
3. Sign in as `player2@dilldinkers.com` / `3FywAuQtEAXo3pzL`.
4. Expected: name + DUPR rating auto-populate on the form. The DUPR ID is shown but **not editable** — confirming we never accept manual IDs.
5. Complete the remaining fields (gender, club, team) and submit.
6. Expected: a new row appears in our `Players` sheet with `dupr_id = KOJDD6` populated.

**B. Show DUPR rating in-app** (proves visibility requirement)
1. Visit https://ctpbleague.com/#players
2. Find the player just registered. Their DUPR doubles rating is displayed next to their name.

**C. Webhook receives RATING_SEED** (proves subscription handshake)
1. After registration in (A), tail `audit_log` at https://dupr.ctpbleague.com/admin/audit
2. Expected: one `RATING_SEED` event row within seconds, signed-OK, processed-at populated.

**D. Submit a match** (proves match CRUD + entitlement gating)
1. Sign in to https://ctpbleague.com/?route=admin as `player1@dilldinkers.com` (Dill Dinkers Test Club Director). The `commissioner` role exists for this email.
2. Go to a scheduled match where all 4 players are linked. Enter scores for each of the 6 court-games.
3. Expected: each saved score triggers a `POST /match/v1.0/create`. The companion's match queue at https://dupr.ctpbleague.com/admin/matches shows 6 rows in status `sent` with DUPR `matchCode` values.

**E. Attempt to submit as a non-operator** (proves role restriction)
1. Sign in as a `captain` role (e.g. a captain account in our Users sheet).
2. Attempt to access the score-entry endpoint.
3. Expected: 403 forbidden. Captains can submit lineups but cannot trigger match writes.

**F. Submit with a missing entitlement** (proves user gating)
1. Manually clear the `entitlements` column on one player row.
2. Submit a match including them.
3. Expected: 400 `{ "error": "players missing BASIC_L1", "duprIds": ["…"] }`.

**G. Delete a match** (proves CRUD completeness)
1. From the admin matches page, void one of the matches posted in (D).
2. Expected: a `DELETE /match/v1.0/delete` fires, the row status flips to `voided`, the `audit_log` records the action with the DUPR `matchCode`.

**H. Support reachability**
1. Click the footer "Support" link on any page → confirms email destination.
2. Visit https://dupr.ctpbleague.com/support directly.

---

## 4. Things we explicitly do NOT do

- **No manual DUPR ID entry anywhere.** The Players sheet has a `dupr_id` column from the legacy CSV-export flow, but the registration UI does not expose it as an input. The only writer is the SSO-exchange endpoint.
- **No silent rating overrides.** We don't write to a player's DUPR rating; we only read what DUPR pushes via webhook.
- **No bypassing club permissions.** Every match push includes our `clubId` and is rejected by DUPR if our partner key isn't scoped to that club.
- **No long-lived shared accounts.** Every operator action is attributed to a specific signed-in user via `score_entered_by_user_id` and `audit_log.actor_player_id`.

---

## 5. Operational details

- **Hosting:** Cloudflare Workers (companion service) + Cloudflare Pages (hub) + Apps Script (CPBL backend) + Google Sheet (data) + Neon Postgres (companion's persistence layer).
- **Token caching:** Partner access tokens cached in Cloudflare KV with TTL tied to DUPR's `expiry` field (typically ~1 hour). Refreshed on cron every 15 minutes ahead of expiry.
- **Webhook signature:** Currently validated as a shared secret in the `x-dupr-signature` header. Happy to switch to HMAC-SHA256 once DUPR confirms the exact scheme — code is a one-line swap.
- **Retry policy:** Failed match pushes retry up to 5 times with exponential backoff via a scheduled Worker trigger; after 5 attempts they're marked `failed` and surfaced in the admin UI for manual review.

---

## 6. Outstanding items

These are noted explicitly so the reviewer knows what's intentionally pending:

- HMAC signature scheme (waiting for confirmation from DUPR — see §5).
- Webhook destination needs to be registered against the production client key (`POST /v1.0/webhook` once prod keys are issued).
- Domains needing whitelisting on the production client key: `ctpbleague.com`, `live.ctpbleague.com`, `dupr.ctpbleague.com`.

---

## 7. What we're requesting

Production API credentials for `Connecticut Pickleball League` (UAT client ID `4907436155`), to be used on the domains listed in §6.

Please reach me at **commissioner@ctpbleague.com** with any questions or follow-up testing requests.
