# Namretep Fantasy

Fantasy sports pages at `/fantasy`. Right now there's only a landing page and no data source. Site-wide rules are in the root `CLAUDE.md`. Don't touch casino code from here.

## Current status

**On hold. The Yahoo Fantasy API was dropped on 2026-11-10.** Work stays on the `fantasy` branch. Don't merge it or push to `main` until the owner says so.

### Why Yahoo was dropped

Yahoo's API agreement only allows **Personal Use**. It rules out what this project needed:

- **No showing data to others:** league pages for friends and league members, the main goal, weren't allowed.
- **No caching or storing data:** the plan relied on a shared per-league cache so more viewers wouldn't mean more Yahoo calls.

### What was removed

- The Yahoo connection page (`/fantasy/connect`), the login callback (`/api/yahoo/callback`), and all token, renewal, and data-reading code.
- The `yahoo_connections` table, by `20261110010000_drop_yahoo_connections.sql`. Keep `20261108010000_yahoo_connections.sql`: the live database has run it, so its history needs both.
- `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, and `YAHOO_TOKEN_ENCRYPTION_KEY` from `.env.example`. They should also be deleted from Vercel and `.env.local`, and the Yahoo developer app deleted, if that isn't done yet.
- The old code is in git history (before the commit that dropped Yahoo) if it's ever useful as reference.

## Maybe later: sportsbook or odds data

The owner may use sportsbook or odds data instead. Before building anything:

- **Read the provider's terms first,** before writing code. Check whether data can be shown to other users, cached or stored, and what attribution it requires. Yahoo was set up before its agreement was read, and that work was lost.
- **Ask the owner** before adding a paid service.
- **Decide display-only vs. virtual-chip betting.** Like the casino, this stays virtual chips only, with no real money.
- **Keep the key server-only,** like the Supabase secret key, with the data in its own tables and pages using our own types, never the provider's raw format.

## Rules that still apply

- `layout.tsx` asks search engines not to index `/fantasy`. It doesn't restrict access.
- If pages show other people's leagues or teams, show only an allowlisted set of fields, leave out personal details like emails, and check on the server who may see each page.
- `projects.ts` lists Fantasy as `live`, so merging shows it on the home page, in the header, and on the account page for everyone.
- `main` has moved on a lot (new header and project menus, bug reports, backdrop). Merge it into this branch before merging back, and switch the fantasy menu to `ProjectBar` with `ProjectNav` inside `<Suspense>`.
