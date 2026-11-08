# Namretep — Project Brief

Namretep is a home for several projects that share one account. The home page (`/`) lists them from `src/lib/projects.ts`. The first project is the **casino** (`/casino`): configurable casino games played with virtual chips only.

**Casino details (game rules, engines, tables, stats, Blackjack, adding a game, theme) are in `src/app/casino/CLAUDE.md`.**

## Site layout

- `/` is the hub, `/account` is the shared account page (username, avatar, log out), `/admin` is site-wide admin, and login and signup are shared.
- Each project lives under its own path with its own `layout.tsx` for its menu and notices. Casino pages are all under `/casino` (games, tables, leaderboard, how-to-play, and `/casino/profile` for chips and stats). Old casino addresses redirect there (`next.config.ts`).
- The site header only has things every project shares (logo, project links, account menu); project-specific things like the chip balance go in the project's own menu, a `ProjectBar` with `ProjectNav` links.
- `/bugs` is the site-wide public bug tracker. Anyone can read it; players with an account can report and comment (limited to 5 reports and 20 comments an hour); admins can reply, set a status, and delete posts (`src/server/bugs.ts`, statuses in `src/lib/bugs.ts`). Status changes and deletions go in the admin log.
- Accounts are shared through `profiles`. Casino data (chips, refills, stats) still lives on `profiles` and the casino tables; split it into its own table when a second project needs accounts.

## Adding a project

List it in `src/lib/projects.ts` (it then appears on the home page, in the header, and on the account page), give it a folder under `src/app/<path>/` with its own `layout.tsx` (use `ProjectBar` for its menu), and add any signed-in-only paths to `SIGNED_IN_ONLY` in `src/proxy.ts`.

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

## Supabase connections

- `src/lib/supabase/`: `server.ts` (the player's session, RLS applies), `admin.ts` (secret key, bypasses RLS, server-only: check the player and their permissions first), `client.ts` (browser).

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

- Admins (`profiles.is_admin`) get an **Admin** link in the account menu and the pages under `/admin`: site overview, players (search, give/take chips, rename, make/remove admin, suspend/restore), open tables (close any table, even mid-hand), and an admin log. Everyone else gets a 404 there.
- Every admin change goes through a SQL function that re-checks the caller is an admin and writes a row to `admin_actions` (the admin log). Chip changes also go in `chip_ledger` as `admin_adjust`.
- Suspending sets `profiles.suspended_at` (locks the account out of every page at once), bans the login in Supabase Auth, and takes them off their tables. Admins can't remove their own admin access or suspend themselves.
- Admins can reset a player's Leaders stats (admin chips and profit and loss), for one player or everyone who's had admin chip changes (`chip_ledger.stats_cleared_at`). Ledger rows and balances don't change, and players must be away from tables first.
- Admins can make other admins from the site. If nobody is left with admin access, it has to be granted again with a migration (`update public.profiles set is_admin = true where id = '…'`).

---

## Accounts & auth

- Players can sign up, log in, log out, and set a username and avatar.
- Supabase **"Confirm email" is currently OFF** (turned off for testing). Turn it back on before real players arrive.
- Supabase **Site URL** is `https://www.namretep.com` (confirmation and reset email links need it).
- Temporary test accounts use `@namretep.test` emails. Count them as you create them, and ask the owner to delete them in Supabase → Authentication → Users.
- There's no password change or reset yet; it belongs on `/account` when built.
- After login, users land on `/` (or the page they were sent from).

---

## Working conventions
- Explain what you're changing before large edits, and keep commits small with clear messages.
- Run `npm run build`, `npm run lint`, and tests before saying something is done.
- Database changes go in Supabase migration files in the repo, never ad hoc.
- This Supabase project does **not** grant table access automatically. Every new table's migration needs explicit `grant`s, including to `service_role`, or server code using the secret key gets "permission denied". After schema changes, run `npm run db:types`.
- Ask before adding a new paid service or major dependency.
- The owner is newer to coding: explain steps in plain language and say exactly what to click or run when something needs doing outside the code.
