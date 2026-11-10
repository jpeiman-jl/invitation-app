# InviteHub

InviteHub is a mobile-first invitation and RSVP application. Hosts manage events and guests; guests respond through unguessable invitation links without creating accounts. The initial architecture is a TypeScript monorepo with a Nuxt 3 web app, a Fastify API, PostgreSQL, and Redis.

## Architecture

```text
Browser ── Nuxt 3 (SSR, Vue 3, Pinia) ── REST /api/v1 ── Fastify API
                                                          │
                                    ┌─────────────────────┼────────────────────┐
                                    │                     │                    │
                               PostgreSQL              Redis/BullMQ      External providers
                               (Prisma)                 (email jobs)     Resend, Stripe, LLM
```

- **Web:** Nuxt renders public invitation pages server-side for link previews and provides the authenticated host dashboard. Shared Zod schemas keep request and response contracts consistent.
- **API:** Fastify owns validation, authentication, authorization, rate limits, and business rules. It alone accesses secrets and verifies payments and paid entitlements.
- **Data:** PostgreSQL is the source of truth. Prisma models users, events, guests, invitations, responses, seating, templates, paid entitlements, and provider activity.
- **Async work:** Redis and BullMQ handle email delivery and reminders. Email and LLM integrations use provider interfaces so implementations can be replaced without changing domain logic.
- **Security:** Passwords, invitation tokens, and session tokens are stored as hashes. Guests do not need accounts. Every host-owned resource is scoped to its owner in the API; paid features are checked server-side.

## Planned monorepo layout

```text
apps/
  web/                 Nuxt 3 application
    app/               Pages, layouts, components, composables
    server/            Nuxt server routes and SSR support
  api/                 Fastify TypeScript API
    prisma/
      schema.prisma    PostgreSQL data model
    src/
      modules/         Auth, events, guests, RSVP, seating, billing
      providers/       Email, LLM, and payment adapters
      jobs/             BullMQ workers
packages/
  shared/              Shared Zod schemas and TypeScript types
```

Session tokens are stored as hashes. Invitation tokens are stored as a hash for lookup and encrypted with an application key so hosts can retrieve the same shareable link later; the encryption key must remain outside the database. RSVP data is modeled as the guest's current response, while email delivery history is retained separately. Seat assignments represent individual occupied seats, so a guest's party can occupy multiple rows.

## Data model

The initial Prisma schema is in [`apps/api/prisma/schema.prisma`](./apps/api/prisma/schema.prisma). Key relationships:

- A user owns events; each event has guests, tables, one active template, and optional paid entitlements.
- A guest has one invitation and one current RSVP. An invitation token is unique and stored as a hash.
- Each seat assignment is one person in one numbered seat; companion rows can refer to the same guest.
- Plans hold configurable limits and feature settings. Event entitlements connect a paid event to its plan and payment.
- Design generations are versioned per event; email logs record invitation, reminder, and RSVP-confirmation delivery attempts.

## Phase 2 API

The Fastify API and shared Zod contracts are implemented under `apps/api` and `packages/shared`. The versioned routes cover password and Google sign-in, session logout/current user, event CRUD, guest CRUD and CSV import, invitation links and queued sends/reminders, public invitation preview, and public RSVP submission. Email-less guests can still receive a shareable link; bulk email actions report queued, skipped, and failed counts. RSVP rules enforce each guest's party-size limit and event deadline.

Host sessions use signed, HTTP-only cookies backed by hashed database session tokens. State-changing requests require the double-submit CSRF cookie/header. Invitation tokens are random 256-bit values; the database stores a SHA-256 lookup hash and an AES-GCM ciphertext for later host sharing. Set a high-entropy `INVITATION_TOKEN_ENCRYPTION_KEY` and keep it outside the database. Passwords are pre-hashed with SHA-256 and then bcrypt-hashed to avoid bcrypt's 72-byte input truncation.

For local API work, use Node.js 20+ and the pinned pnpm version:

```sh
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm --filter @invitehub/api dev
pnpm --filter @invitehub/api worker
```

PostgreSQL and Redis must be available before starting the API and worker. Configure Google OAuth and Resend credentials in `.env` to enable those providers. Swagger UI is served at `/documentation` when `SWAGGER_ENABLED=true`.

## Phase 3 web app

The Nuxt app in `apps/web` includes host registration and sign-in, a dashboard, event creation/editing and overview, guest management with CSV import, invitation-link sharing and email/reminder actions, and a server-rendered public invitation/RSVP page. Six built-in designs are defined in `packages/shared/src/templates.ts`, with selectable visual previews for weddings, birthdays, baby showers, corporate events, debuts, and christenings. An event can include multiple occasion types while selecting one invitation design; selected occasions appear on the guest invitation. The renderer accepts structured template data and keeps RSVP controls app-owned.

Run the web app with `pnpm --filter @invitehub/web dev` after installing dependencies and building the shared package. Set `NUXT_PUBLIC_API_BASE` if the API is not at `http://localhost:4000`. Vite is pinned to the version expected by Nuxt 3.15.4 to keep development CSS module serving compatible.

## Phase 4 seating

The host seating chart supports round, rectangular, square, banquet, head, sweetheart, cocktail, and custom tables. Hosts can assign pending and maybe guests one provisional seat, seat confirmed party members, drag names between seats (swapping when a target is occupied), unassign a party, and run household-aware auto-assignment. Companion seats remain linked to their primary guest, with full names and that relationship available on hover. The chart provides a table guest list, capacities, assigned/unassigned counts, CSV export, and a print view that can be saved as PDF. Seating remains private until published; a guest invitation only shows seats assigned to that invitation's guest and party after publication. If an RSVP changes party size, the existing primary seat is retained and the party is reseated at that table when there is room; otherwise the party is unassigned for the host to arrange.

Owner-scoped seating routes are available under `/api/v1/events/:eventId`: `GET /seating`, `POST /tables`, `PATCH` and `DELETE /tables/:tableId`, `POST /tables/:tableId/assignments`, `PATCH /assignments/:assignmentId`, `DELETE /assignments/:guestId`, `POST /seating/auto-assign`, and `PATCH /seating/publication`. Table types, capacity, positions, and assignment bodies are validated with shared Zod schemas. Assignment, move, and auto-assignment writes use serializable transactions to prevent conflicting seat reservations.

The event overview links to an invitation preview page showing the selected design and cover details. Hosts can preview and change designs directly from the page, and can add and edit up to 50 program items, each with a title, optional time, lead/speaker, and description. Program items are stored on the event and displayed in both the invitation preview and the guest-facing invitation. The `program_items` JSONB column is added by the `20261028103000_add_event_program_items` migration; `occasion_types` is added by `20261028152500_add_event_occasion_types`.

## Phase 5 payments and entitlements

The one-time Custom Design upgrade uses Stripe Checkout. Hosts start checkout from their event overview; price, currency, guest caps, and generation limits come from active `Plan` rows in PostgreSQL. `pnpm db:seed` creates the initial `free` and `custom_design` plans using the `FREE_*` and `CUSTOM_DESIGN_*` values in `.env`. The seed script updates those two configuration records when rerun; adjust the environment first if you want to change their configured values. Event creation and guest creation/CSV import enforce the free active-event and per-event guest caps on the API. Paid guest caps apply only after the Stripe webhook grants an active event entitlement.

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env`. Stripe sends events to `POST /api/v1/billing/webhook`; the route verifies the signature against the unparsed request body, records event IDs for idempotent processing, and only grants an entitlement after a paid Checkout session matches its server-created payment, event, user, plan, currency, and amount. Async payment failures, expired sessions, and full refunds update payment status; full refunds revoke their entitlement. A browser redirect never grants access. For local testing, use Stripe CLI to forward webhook events to `http://localhost:4000/api/v1/billing/webhook` and set the CLI-provided signing secret as `STRIPE_WEBHOOK_SECRET`.

The active public catalog is `GET /api/v1/billing/plans`; owner-scoped entitlement state and guest usage are `GET /api/v1/events/:eventId/entitlement`; Checkout is created at `POST /api/v1/events/:eventId/checkout`. Stripe keys are server-only. Configure valid live keys and a live webhook endpoint before production deployment. Initialize a new database with `pnpm db:migrate`, then run `pnpm db:seed`.

## Phase plan

1. **Complete:** Architecture, folder structure, and Prisma schema.
2. **Complete:** API authentication, events, guests, invitations, public RSVP, and email eligibility/delivery.
3. **Complete:** Host dashboard, event and guest management, public RSVP pages, and default templates.
4. **Complete:** Visual seating chart, table types, party assignments, validation, household auto-assignment, and exports.
5. **Complete:** Stripe Checkout, verified/idempotent webhooks, plan-backed limits, and event entitlements.
6. Structured AI design generation, provider adapters, and safe rendering.
7. Tests, documentation, and deployment notes.

Each phase will be implemented after confirmation of the previous phase.
