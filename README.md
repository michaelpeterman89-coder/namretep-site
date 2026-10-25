# Namretep

Configurable casino games played with virtual chips only. See `CLAUDE.md` for the full project brief.

## Running locally

1. Install Node.js 24 or newer.
2. `npm install`
3. Copy `.env.example` to `.env.local` and fill in your Supabase URL and publishable key.
4. `npm run dev`, then open http://localhost:3000

Check the Supabase connection at http://localhost:3000/api/health

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm test` — unit tests (Vitest)
