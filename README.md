# Podium

A multi-tenant back office for **leaderboard promotions** in e-commerce: a
retailer runs "top 10 spenders this week win a coupon" campaigns across its
brands, and Podium handles scheduling, access, time zones and ranking.

> The patterns here are the ones I work with daily on a B2B back office
> (React + NestJS + Java services): tenant/brand scoping, campaigns with a
> scheduled lifecycle, admin-local time zones, money in minor units,
> normalized prize models and report queries without N+1. That code is under
> NDA; this is a clean-room project in a different domain.

**Live:** [podium.vitaliipopov.dev](https://podium.vitaliipopov.dev) (sign in as any demo user)

**Stack:** NestJS 10, Prisma 6, PostgreSQL, React 18 + MUI DataGrid, TanStack Query, Zod shared between API and UI, Upstash QStash, Vercel

## What's interesting

### Access is resolved once, enforced everywhere
Every request becomes an `Actor`: tenant, role, and the concrete brand ids the
user may touch (all brands for an owner). Every read starts from a
`visibleTo(actor)` filter; ids from the client are never trusted on their own.
A brand manager **sees** a campaign that touches any of their brands but can
**edit** it only if it touches nothing else. Viewers are refused by the API,
not just by hidden buttons. A foreign tenant's campaign is a 404, not a 403,
so ids don't leak.

### Lifecycle: one pending task per campaign
`DRAFT → SCHEDULED → LIVE → ENDED` (or `CANCELLED`). Scheduling a campaign
queues exactly one delayed message (QStash `Not-Before`) for its next
transition; when it fires, it applies the transition and queues the next.

Delivery is at-least-once and can be late, early or obsolete. Each task
carries the campaign's `scheduleVersion`; any edit that moves the schedule
bumps it, so a task queued for the old start time becomes a no-op instead of
starting the campaign at the wrong moment. The status update is conditional
(`WHERE status = … AND scheduleVersion = …`), so two concurrent deliveries
apply at most once. A daily sweep is the safety net.

### Rules by state
Brands, prizes and the minimum order **lock an hour before start** (shoppers
may already see the promo) and stay locked while live; a live campaign can
only be renamed or have its end moved. A start in the past is refused, not
silently turned into "live now". Concurrent edits by two admins are caught
with optimistic locking (`version`).

### Time zones: convert once, at the edges
Admins type wall-clock times in **their** zone (stored per user); the API
converts to UTC exactly once; every screen renders back in the viewer's zone.
An owner in New York and a manager in São Paulo see the same instant on their
own clocks. Conversion is `Intl`-only and tested across DST.

### Money and prizes
Integer minor units with ISO 4217 currency, parsed from decimal strings (no
float math). A campaign can't mix brands with different currencies. Prizes are
one row per place (`@@unique([campaignId, place])`), validated as a gapless
1..N sequence by the same Zod schema in the form and the API.

### Leaderboard in one query
Ranking runs in Postgres: one aggregate with `RANK() OVER (ORDER BY …)` across
the campaign's brands and window, paginated server-side, ties sharing a place.
Campaign lists load relations in a single batched query plus a count.

### Failing loudly, answering consistently
The env is parsed with Zod before Nest boots: a missing `DATABASE_URL`,
production without `SESSION_SECRET`, or QStash without its signing key or
public URL stops the API with every problem listed (never a value). Every
error, whether from a domain rule, validation, auth or a crash, leaves as one envelope,
`{ error, message, details?, requestId }`, with `x-request-id` on every
response; unexpected errors are logged under that id, never echoed. If QStash
is down when a campaign is saved, the save still stands and the daily sweep
applies the transition.

## Tests

- **Unit:** domain rules (access, lifecycle), time zones across DST, money,
  config parsing, the error envelope.
- **Integration:** `apps/api/src/api.int.test.ts` boots the real Nest app
  against a seeded Postgres in CI: 401 envelope with request id, cross-tenant
  ids → 404, brand-scoped viewers, a viewer's write → 403, stale version →
  409, validation details, no persistence fields in responses, unsigned
  transition → 403. Skipped locally unless `PODIUM_INTEGRATION=1`, so it never
  touches a real database by accident.

## Layout

```
packages/shared   Zod schemas, time-zone and money helpers (used by both apps)
apps/api          NestJS + Prisma. src/domain = pure rules (unit-tested)
apps/admin        React + MUI admin, server-side paging/sorting via DataGrid
api/index.js      Vercel function → Nest
```

## Run locally

```bash
npm install
cp .env.example apps/api/.env   # DATABASE_URL to any Postgres (Neon works)
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npm run db:seed -w @podium/api
npm run build -w @podium/shared
npm run dev:api     # http://localhost:3001/api
npm run dev:admin   # http://localhost:5173 (proxies /api)
```

Sign in as any demo user: two tenants, three roles, four time zones.
