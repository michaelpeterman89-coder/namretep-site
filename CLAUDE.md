# Namretep — Project Brief

Namretep is a website for **configurable casino games** played with **virtual chips only** (no real money, no purchases, no cash-out). Players create tables for a game, choose that table's rules, play alone or invite other players to join, and build up per-game stats on their account.

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
- **Lobby** page lists open public tables with their game, key rules, and open seats.
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
| Min / max bet | chip amounts |
| Seats | 1–7 |

Each table shows a short **rules summary** (e.g. "6D · S17 · 3:2 · DAS · LS") and an approximate **house edge** for that rule set.

### "On Book %" (playing by the book)
- For each player decision (hit, stand, double, split, surrender, insurance), compare it to **basic strategy for that table's exact rules** (deck count, S17/H17, DAS, surrender, peek).
- Store each decision with whether it matched the book.
- **On Book %** = correct decisions ÷ total decisions, overall and per table rule set.
- Show which situations a player misses most (e.g. "soft 18 vs dealer 9").
- Optional toggle at the table: show a hint after a mistake (off by default, and hint-on hands are flagged in stats).

---

## Future games (build after Blackjack is solid)
Design the table/config/stats system so new games plug in without rewrites. Planned:
- Roulette (American / European / French, la partage)
- Craps (odds multiples, field payouts)
- Baccarat (commission vs no-commission)
- Texas Hold'em (player vs player; blinds, buy-in)
- Video Poker (pay tables, e.g. 9/6 Jacks or Better)

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

Work in phases. Finish and test each one before starting the next.

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
- Ask before adding a new paid service or major dependency.
- The owner is newer to coding: explain steps in plain language and say exactly what to click or run when something needs doing outside the code.
