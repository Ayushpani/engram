# @repo/site

Smaran marketing site — Next.js 15 (app router), deploys to Vercel.

## Dev

```bash
bun install
bun run dev
```

Opens `http://localhost:3001`.

## Deploy

Vercel project rooted at `apps/site`. Framework preset `Next.js`. No env vars needed for the landing.

## Structure

- `app/page.tsx` — landing route (delegates to `landing.client.tsx`).
- `app/landing.client.tsx` — the whole landing page as one client component (12 sections, cursor, rail spine, story scrub, tape strip, adapter tabs, wave canvas).
- `app/globals.css` — full stylesheet, matte cream + blue token system.
- `app/layout.tsx` — Google Fonts + metadata.

Docs pages will land at `app/docs/**` as MDX in a follow-up commit.
