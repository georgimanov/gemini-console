# Web UI Plan

## Goal

React-based web UI with:
1. Login with Google
2. Chat page with a persona dropdown
3. Plans page (view generated plans)
4. Real per-user sessions (replacing the single hardcoded owner)

## Current state (before this work)

- Fastify server (`src/interfaces/server/index.ts`) serves a static vanilla-JS UI and exposes
  `/personas`, `/sessions`, `/sessions/:id/persona`, `/sessions/:id/messages` (SSE streaming).
- Everything is scoped to one hardcoded "owner" user (`src/core/owner.ts`) — no auth.
- Chat sessions live in an in-memory `Map` (`src/core/sessionStore.ts`) — lost on restart, single
  process only.
- `plans` / `plan_versions` tables exist and are populated by persona tools, but there's no read API.
- `users`, `chat_sessions`, `chat_messages` tables already exist in the schema (`migrations/0001_init.sql`)
  but aren't wired up yet. `users.google_sub` is already there, ready for Google auth.

## Decisions

- **Chat session persistence**: persist to Postgres now, using the existing `chat_sessions` /
  `chat_messages` tables, rather than staying in-memory. Needed anyway once there's more than one user.
- **Auth session**: stateless JWT in an httpOnly signed cookie. No new session table; logout just
  clears the cookie.
- **Frontend stack**: Vite + React + TypeScript + React Router, in a new `web/` directory, built
  output served from `src/interfaces/server/public` — keeps the existing Fastify static-serving setup
  and Railway deploy, no new hosting target.
- **Design**: single responsive build (mobile-first, no separate desktop/mobile versions). Eggshell-white
  base palette, soft blue/green accents, warm grey for secondary text/borders. Flat, airy, minimal —
  plain system font stack, simple rounded cards/buttons, no component library/UI kit, no heavy
  shadows/gradients. Fluid layout up to a max content width (~640-720px) on larger screens.

## Backend changes

1. **Auth**
   - `google-auth-library` to verify Google ID tokens.
   - `POST /auth/google`: verify ID token, upsert into `users` by `google_sub`, set httpOnly signed
     JWT cookie.
   - `GET /auth/me`, `POST /auth/logout`.
   - Fastify `preHandler` hook resolves `userId` from the cookie and attaches it to the request,
     replacing `src/core/owner.ts`.

2. **Chat persistence**
   - Replace `sessionStore.ts`'s in-memory `Map` with reads/writes against `chat_sessions` /
     `chat_messages`, scoped by `user_id`.
   - `POST /sessions` creates a row; `POST /sessions/:id/messages` appends both the user and model
     turns.
   - Add `GET /sessions` (list a user's past sessions) and `GET /sessions/:id` (resume one, replaying
     stored messages into a fresh in-process chat).

3. **Plans API**
   - `GET /plans` — personas × dates with saved plans for the user.
   - `GET /plans/:personaId/:date` — full version history, reading from the existing `planStore`.

4. All existing routes (`/personas`, `/sessions/*`) become user-scoped via the auth hook instead of
   the global owner lookup.

## Frontend (new `web/` dir)

- Vite + React + TypeScript + React Router.
- Build output served from `src/interfaces/server/public`.
- **Login page** — Google Identity Services button → posts ID token to `/auth/google` → redirect to
  `/chat`.
- **Chat page** — persona dropdown (`GET /personas`), session list/resume, SSE streaming reply
  (reuses the existing event protocol).
- **Plans page** — browse personas/dates with saved plans, view version history.
- Route guard checks `/auth/me` on load; unauthenticated → `/login`.

## Migration

- No new tables needed — `users`, `chat_sessions`, `chat_messages` already exist and just need to be
  used. JWT auth needs no DB table.

## Build order

1. Auth (Google sign-in + JWT cookie + auth hook), swap out `owner.ts`.
2. Persist chat sessions/messages to Postgres, update session routes.
3. Plans read API.
4. React app scaffold + login page, wired to real auth, with the design system above.
5. Chat page, then Plans page.
