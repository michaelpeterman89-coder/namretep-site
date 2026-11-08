# Namretep Fantasy

Fantasy sports pages at `/fantasy`, using the Yahoo Fantasy Sports API. So far there's a landing page and the Yahoo connection (`/fantasy/connect`, admins only), which lists the connected account's leagues; league pages come next. Site-wide rules are in the root `CLAUDE.md`. Don't touch casino code from here.

## Status

- Work happens on the `fantasy` branch. Don't merge or push to `main` until the owner says so.
- Yahoo API access application submitted 2026-11-08; no reply yet.
- First real login (2026-11-08): login, token exchange, and encrypted storage work. Every API call tried returns `403 "This application is not authorized to perform this action"`, even `/game/nfl`, so the block is on the app rather than the user, most likely pending Yahoo's review. League pages wait for this. Retry `/fantasy/connect` after Yahoo replies; no reconnect should be needed unless Yahoo says so.
- Not yet seen working: a successful data response (including its JSON shape) and a live token renewal.
- First league to test against: the owner's football league. Read its scoring type from Yahoo; keep pages generic.

### Before merging to main

- Settle whether Yahoo allows showing league data publicly (see "Who can see a league").
- Add Yahoo's official logo to the attribution. It isn't in the repo yet.
- Add any new env vars to Vercel for Production.
- `projects.ts` lists Fantasy as `live` so it's testable on the preview. Merging puts it on the home page, in the header, and on the account page for everyone.

## Code layout

- `src/lib/fantasy/yahoo/`: logic with no database or secrets, so it can be tested (`oauth`, `token-crypto`, `token-renewal`, `leagues`, `errors`).
- `src/server/fantasy/yahoo-connection.ts`: the only code that touches tokens. `yahoo-read.ts`: GET-only Yahoo calls. Manage features get their own file.
- `src/app/api/yahoo/callback/route.ts`: Yahoo's return address. It needs `await connection()`, or the build can save a fixed copy of it.
- `src/app/fantasy/connect/`: the connection page and its server actions.

## Scope

- **Now:** one connected Yahoo account (the owner's), read-only, with the owner's league viewable by anyone (see "Who can see a league").
- **Later:** other users connect their own Yahoo accounts to view their own leagues.
- **Later, if Yahoo allows it:** manage features (roster moves, lineups).
- **Maybe later:** sportsbook data (see "Future plans").

## Yahoo API notes

Docs: https://sports.yahoo.com/developer/docs/ (the old `developer.yahoo.com/fantasysports/guide` address redirects to the developer page).

- **Base URL:** `https://fantasysports.yahooapis.com/fantasy/v2`
- **Keys:** league `<game_id>.l.<league_id>`, team `<game_id>.l.<league_id>.t.<team_id>`, player `<game_id>.p.<player_id>`. The separator is a lowercase L.
- **Current user:** `/users;use_login=1/games`
- **Current user's leagues:** `/users;use_login=1/games;is_available=1;game_types=full/leagues`. `is_available=1` means in season only, and `game_types=full` skips pick'em games, since asking for leagues on a game that doesn't support them throws an error. Off-season, this returns nothing.
- **Format:** the docs only show XML and never mention `format=json`, which is reported by other developers. `yahoo-read.ts` uses it, and the first real login tests it. Yahoo's JSON keeps numbered keys from the XML, so don't rely on one exact shape. Ask the owner before adding an XML parser.
- **Rate limits:** no number is published. Yahoo says it may throttle excessive use, so cache responses.
- **Access rule from Yahoo:** a user can only read private leagues they belong to, or public leagues.
- **Attribution (required):** show "Fantasy data provided by Yahoo Fantasy" with a link back to Yahoo Fantasy, plus the official logo, unaltered.
- **Write access:** the access page says "Write access is not available at this time," though the docs describe write calls.
- **Unknown:** we haven't found the API Access and Use Agreement, so we don't know its rules on storing data or showing it to other people. Until it's read, keep Yahoo data only in short-lived caches. Check it before making a private league visible to others.
- **Not checked:** the docs from about character 39,000 to 139,000 of the page (roster, team, and league sections) were only summarized. Read them before building those pages.

## Yahoo login (OAuth 2.0)

- **Authorize:** `https://api.login.yahoo.com/oauth2/request_auth`
- **Tokens:** `POST https://api.login.yahoo.com/oauth2/get_token`
- **Callback:** `/api/yahoo/callback`. Both registered addresses are in `oauth.ts`, chosen by `VERCEL_ENV`. Don't build the redirect address from the request's Host header.
- **Forged logins:** send a random `state`, keep a copy in an httpOnly cookie, and check it and the site login on the callback. `src/proxy.ts` skips `/api`, so these routes must check the login themselves.
- **Access tokens** last 1 hour. Renew shortly before they expire.
- **Refresh tokens** may rotate: Yahoo can revoke the old one when it issues a new one. Allow one renewal at a time per connection using a database lock, or two simultaneous renewals can break the connection. If renewal fails for good, show **Reconnect**.
- **Identity:** `xoauth_yahoo_guid` is deprecated, so don't rely on it.

### Token storage

Tokens are server-only, like the Supabase secret key.

- `yahoo_connections` has one row per site account, never one global token.
- Row Level Security is on with no player policies, and access is granted only to `service_role`. Read it with `createAdminClient()` after checking who is asking.
- Tokens are encrypted in the app with `YAHOO_TOKEN_ENCRYPTION_KEY`, and each is tied to its site account. Every environment sharing the database needs the same key. Changing it means reconnecting.
- Only admins can connect for now (`connectYahooAction` and the callback both check).

### Testing redirects

Yahoo requires an exact https redirect address.

- **Preview:** `https://namretep-site1-git-fantasy-namretep.vercel.app/api/yahoo/callback` is registered alongside production. Start the login from that address, because cookies don't carry over from a per-deployment one; the connect action sends you there if needed.
- **Local:** there's no Connect button. Connect on the preview, then `npm run dev` reuses the saved connection through the same Supabase project and encryption key. Confirmed that a local script can read and decrypt it; the site's own pages haven't been tried locally with it yet.

## Who can see a league

**First phase:** public, no login. Each shared league has a `visibility` setting (`public` or `members`), so access can be tightened without rebuilding pages.

**Before public pages reach production:** read Yahoo's agreement or get Yahoo's answer on showing league data publicly, since the application may have described a narrower audience.

Public pages must:

- Show only an allowlisted set of fields. Never pass Yahoo's raw response to a page, and leave out manager emails and Yahoo IDs if Yahoo returns them.
- Use team names rather than managers' personal names unless the owner decides otherwise.
- Ask search engines not to index them. `layout.tsx` sets this for all of `/fantasy`. It doesn't restrict access.
- Serve from the per-league cache, so public traffic can't cause unlimited Yahoo calls.

Options for later:

- **Members only:** an invite link that a friend opens while signed in to a site account, which adds them to the league's member list. Removing one person doesn't affect anyone else.
- **Any logged-in site user:** simple, but signup is open, so it's close to public.
- **Private link, no account:** easiest for friends, but it can be forwarded and access can only be ended for everyone at once by changing the link.

### Rules for shared viewing

Viewers have no Yahoo connection, so the server reads the league with the connected owner's token. That makes these rules important:

- A league is only readable with someone else's token if its owner shared it. Never pass an arbitrary league key from a URL to the owner's token.
- Check the league's `visibility` on the server for every page and route, before any Yahoo call. For `members`, also check membership.
- Shared viewing is always read-only. Manage features must only ever use the acting user's own token.
- Viewers never see tokens or the owner's other leagues.
- Cache shared league data per league, so more viewers don't mean more Yahoo calls. Private data for a user's own connection stays cached per user.
- If the owner's connection breaks, viewers see a plain "temporarily unavailable" message; only the owner sees **Reconnect**.

Likely tables: `fantasy_shared_leagues` (league key, owner, visibility), then for members-only access a hashed invite token and `fantasy_league_members` (league, user).

## Future plans (don't build yet)

- **Multi-user:** remove the admin-only check on connecting. Check Yahoo's approval covers more users first. League pages use `/fantasy/leagues/[leagueKey]`; viewers with their own connection use their own token.
- **Manage:** keep Yahoo reads and writes in separate files, and record each connection's permissions. Needs Yahoo to grant write access and users to approve it again.
- **Sportsbook data:** a separate data source with its own server-only key and tables. Pages use our own types, not Yahoo's raw format. Keep Yahoo player and team IDs so odds can be matched later. Before building, decide display-only vs. virtual-chip betting, ask the owner about any paid service, and check both providers' terms.
