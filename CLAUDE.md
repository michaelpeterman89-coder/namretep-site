# Namretep — Project Brief

Namretep is a home for several projects that share one account. The home page (`/`) lists them from `src/lib/projects.ts`. The first project is the **casino** (`/casino`): **configurable casino games** played with **virtual chips only** (no real money, no purchases, no cash-out). Players create tables for a game, choose that table's rules, play alone or invite other players to join, and build up per-game stats on their account.

## Site layout

- `/` is the hub, `/account` is the shared account page (username, avatar, log out), `/admin` is site-wide admin, and login and signup are shared.
- Each project lives under its own path with its own `layout.tsx` for its menu and notices. Casino pages are all under `/casino` (games, tables, leaderboard, how-to-play, and `/casino/profile` for chips and stats). Old casino addresses redirect there (`next.config.ts`).
- The site header only has things every project shares; project-specific things like the chip balance go in the project's own menu.
- Accounts are shared through `profiles`. Casino data (chips, refills, stats) still lives on `profiles` and the casino tables; split it into its own table when a second project needs accounts.

## Adding a project

List it in `src/lib/projects.ts` (it then appears on the home page, in the header, and on the account page), give it a folder under `src/app/<path>/` with its own `layout.tsx`, and add any signed-in-only paths to `SIGNED_IN_ONLY` in `src/proxy.ts`.

Live site: www.namretep.com (Vercel, domain from GoDaddy). Repo: GitHub, deploys via Vercel.

---

## Tech stack

- **Next.js** (App Router) + **TypeScript** (strict mode)
- **Tailwind CSS** for styling
- **Supabase** for:
  - **Auth** (email/password to start; Google sign-in later)
  - **Postgres** database
  - **Realtime** for multiplayer tables (Vercel serverless functions can't hold WebSocket connections, so all live table updates go through Supabase Realtime)
  - **Row Level Security** on every table
- **Vercel** hosting
- Package manager: npm

Secrets live in `.env.local` (never committed) and in Vercel Environment Variables. Keep `.env.example` up to date with variable names only.

## Commands

- `npm run dev` / `npm run build` / `npm run lint` / `npm test` (Vitest, `src/**/*.test.ts`)
- Apply migrations to the live database: `npx supabase db push --linked` (needs the owner's OK), then `npm run db:types`.
- After adding or moving routes, run `npx next typegen` so `PageProps`/`LayoutProps` types catch up.
- Run Vitest from `E:\namretep-site` (uppercase drive). From a lowercase `e:` path it finds "no tests" and still passes (`passWithNoTests`), so check the test count.

## Code layout

- `src/lib/games/<game>/`: pure engines plus tests. `src/server/<game>.ts`: database-backed game logic (deal, act, settle, timeouts), called from `src/app/casino/<game>/actions.ts` server actions and the `src/app/api/<game>/[tableId]` refresh routes (blackjack uses `api/tables`).
- `src/lib/supabase/`: `server.ts` (the player's session, RLS applies), `admin.ts` (secret key, bypasses RLS, server-only: check the player and their permissions first), `client.ts` (browser).
- Live tables: clients subscribe to Realtime `UPDATE`s on their `game_tables` row, then refetch state from the API route (with a 10s fallback poll). Any change players should see must bump that row.
- Hidden cards live in server-only tables with no client grants (`blackjack_round_secrets`, `poker_hand_secrets`, `baccarat_shoes`). The public state only ever holds dealt or revealed cards.
- Every chip change goes through `chip_ledger`, with a `reason`. Stats go in `player_game_stats`.

## Next.js 16 gotchas (see AGENTS.md)

- `cacheComponents` is on: anything that reads cookies (e.g. `getCurrentPlayer()`) must render inside `<Suspense>`, or the build fails.
- Middleware is `src/proxy.ts`. Redirects in `next.config.ts` run before it.

---

## Deployment

- Vercel deploys production from `main`: **every push to `main` goes live at www.namretep.com.** Only push to `main` when the change is ready for players, after build, lint, and tests pass, and ask the owner first.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the server-only `SUPABASE_SECRET_KEY` are set in Vercel. Any new env var must be added in Vercel too (and to `.env.example`), or the deploy will break.
- After a deploy, check www.namretep.com/api/health to confirm Supabase is connected.

---

## Admin

- Admins (`profiles.is_admin`) get an **Admin** link in the header and the pages under `/admin`: site overview, players (search, give/take chips, rename, make/remove admin, suspend/restore), open tables (close any table, even mid-hand), and an admin log. Everyone else gets a 404 there.
- Every admin change goes through a SQL function that re-checks the caller is an admin and writes a row to `admin_actions` (the admin log). Chip changes also go in `chip_ledger` as `admin_adjust`.
- Suspending sets `profiles.suspended_at` (locks the account out of every page at once), bans the login in Supabase Auth, and takes them off their tables. Admins can't remove their own admin access or suspend themselves.
- Admins can reset a player's Leaders stats (admin chips and profit and loss), for one player or everyone who's had admin chip changes (`chip_ledger.stats_cleared_at`). Ledger rows and balances don't change, and players must be away from tables first.
- Admins can make other admins from the site. If nobody is left with admin access, it has to be granted again with a migration (`update public.profiles set is_admin = true where id = '…'`).

---

## Core rules for how the game code works

1. **The server is the dealer.** Card shuffling, the shoe, dealing, and payouts happen only on the server (Next.js route handlers / server actions or Supabase database functions). The browser never receives undealt cards or the dealer's hole card before it's revealed.
2. **Use a cryptographically secure RNG** (`crypto.getRandomValues` / `crypto.randomInt`) for shuffling. Fisher–Yates shuffle.
3. **Validate every player action on the server** (it's their turn, the action is legal under this table's rules, they have enough chips).
4. **Game engines are pure TypeScript** in `src/lib/games/<game>/`, with no UI or database code, so they can be unit tested. Each engine takes a table config + state + action and returns a new state.
5. **Write unit tests** (Vitest) for every game engine, payout, and the basic-strategy chart lookup.

---

## Features

### Accounts
- Sign up, log in, log out, username, avatar.
- Every new account starts with a chip balance (e.g. 10,000). Players can claim a daily chip refill if they're low, so nobody gets locked out.

### Tables
- Any logged-in player can **create a table** for a game and set its rules (see game settings below).
- Table options: name, **public** (listed in the lobby) or **private** (join by invite code/link), number of seats, min/max bet.
- **Solo play** = a private table with one seat. Same engine, same stats.
- **Tables** page (`/casino/tables`, formerly the lobby) lists open public tables with their game, key rules, and open seats.
- Players can **join** an open seat, **leave**, and optionally **spectate**.
- Turn timer for multiplayer tables (auto-stand / sit-out if a player times out).
- The table creator can close the table. Empty tables close automatically after a while.

### Stats (per player, per game)
- Hands/rounds played, wins, losses, pushes
- Net chips won/lost, biggest win, biggest loss
- Blackjack-specific: blackjacks dealt, busts, doubles, splits, surrenders, and **"On Book %"** (see below)
- A profile page showing these stats, filterable by game and by table rules.

---

## Game 1: Blackjack

### Configurable table settings
| Setting | Options |
|---|---|
| Number of decks | 1, 2, 4, 6, 8 |
| Dealer on soft 17 | Stands (S17) / Hits (H17) |
| Blackjack payout | 3:2, 6:5, 1:1 |
| Dealer peeks for blackjack | Yes / No (no = European no-hole-card) |
| Double down allowed on | Any two cards / 9–11 only / 10–11 only |
| Double after split (DAS) | Yes / No |
| Max hands from splitting | 2, 3, 4 |
| Re-split aces | Yes / No |
| Hit split aces | Yes / No |
| Surrender | None / Late / Early |
| Insurance offered | Yes / No |
| Shuffle point (penetration) | e.g. 50%–85% of shoe |
| Min / max bet | chip amounts, or no max |
| Seats | 1–7 |

Each table shows a short **rules summary** (e.g. "6D · S17 · 3:2 · DAS · LS") and an approximate **house edge** for that rule set.

### "On Book %" (playing by the book)
- For each player decision (hit, stand, double, split, surrender, insurance), compare it to **basic strategy for that table's exact rules** (deck count, S17/H17, DAS, surrender, peek).
- Store each decision with whether it matched the book.
- **On Book %** = correct decisions ÷ total decisions, overall and per table rule set.
- Show which situations a player misses most (e.g. "soft 18 vs dealer 9").
- Optional toggle at the table: show a hint after a mistake (off by default, and hint-on hands are flagged in stats).

---

## Adding a game

Every game is listed once in `src/lib/games/catalog.ts` (name, page path under `/casino`, and its color for buttons and labels). A new game also needs a How to Play guide in `src/app/casino/how-to-play/guides/` registered in `guides/index.ts` — the build fails without one, and the guide page, overview card, and links then appear automatically. Remove the game from `PLANNED_GAMES` when it launches.

## More games
Live: Blackjack, Texas Hold'em (with bots), Craps, Baccarat. Still planned:
- Roulette (American / European / French, la partage)
- Video Poker (pay tables, e.g. 9/6 Jacks or Better)
- More poker (Omaha, Seven-Card Stud as poker table options)

---

## Visual theme: "retro card game in deep space"

The look is **inspired by** chunky pixel-art roguelike card games (Balatro-style), set **in outer space**. All art, fonts, and assets must be **original or properly licensed**; do not copy Balatro's assets, fonts, or logos.

- Dark space backgrounds: deep navy/purple, slow-drifting starfields, nebula glows, distant planets
- Pixel-art cards with thick outlines; slightly oversized, tactile, bouncy card animations (deal, flip, wobble, shake on big wins)
- A subtle **CRT / scanline** overlay effect (with a setting to turn it off)
- Bright neon accents (magenta, cyan, gold) for chips, buttons, and win effects
- Pixel or retro display font for headings, readable font for body text
- Chips styled like little planets or space tokens
- Satisfying feedback: score counters that tick up, particle bursts on wins
- Must work on phones as well as desktop
- Respect `prefers-reduced-motion`

---

## Build order

Phases 1–6 are done, and phase 7 is under way (Hold'em, Craps, and Baccarat are live). Work in phases. Finish and test each one before starting the next.

1. **Setup** — Next.js + TypeScript + Tailwind, Supabase client, basic space-themed layout, deploys on Vercel.
2. **Accounts** — sign up / log in / profile, chip balance, daily refill.
3. **Solo Blackjack** — pure engine with all table settings, unit tests, playable UI.
4. **Stats + On Book %** — decision logging, basic-strategy engine for every rule combination, stats pages.
5. **Multiplayer tables** — create/join/leave, lobby, Supabase Realtime, turn timers, private invite links.
6. **Polish** — animations, sounds (with mute), mobile layout, accessibility.
7. **More games**, one at a time.

---

## Working conventions
- Explain what you're changing before large edits, and keep commits small with clear messages.
- Run `npm run build`, `npm run lint`, and tests before saying something is done.
- Database changes go in Supabase migration files in the repo, never ad hoc.
- This Supabase project does **not** grant table access automatically. Every new table's migration needs explicit `grant`s, including to `service_role`, or server code using the secret key gets "permission denied". After schema changes, run `npm run db:types`.
- Ask before adding a new paid service or major dependency.
- The owner is newer to coding: explain steps in plain language and say exactly what to click or run when something needs doing outside the code.
