# Gemini Console Dojo

An AI coach over Gemini, OpenAI, or Ollama with swappable coaching personas —
usable as a terminal REPL or as an HTTP/SSE API with a React web UI (Google
sign-in, chat, and a plans viewer). All persona, profile, Garmin, plan, user,
and chat-history data lives in Postgres (Neon).

## Setup

```bash
npm install
npm run db:migrate     # applies migrations/*.sql against DB_CONNECTION_STRING
```

`.env` variables:

| Variable                | Used for                                               |
| ------------------------ | ------------------------------------------------------- |
| `DB_CONNECTION_STRING`   | Postgres/Neon connection (see `src/core/db.ts`)        |
| `LLM_PROVIDER`           | `gemini` (default), `openai`, or `ollama`              |
| `LLM_MODEL`               | model override (optional, see `src/core/defaults.ts`)  |
| `GEMINI_API_KEY`         | when `LLM_PROVIDER=gemini`                              |
| `OPEN_AI_API_KEY`        | when `LLM_PROVIDER=openai`                              |
| `GARMIN_USERNAME` / `GARMIN_PASSWORD` | Garmin Connect login, for `sync:garmin`   |
| `GMAIL_USER` / `GMAIL_PASS`           | outbound email, for `/mail` and `send:mail` |
| `GOOGLE_CLIENT_ID`       | Google OAuth client id, for web UI sign-in (see below) |
| `JWT_SECRET`             | signs the web UI's session cookie — `openssl rand -hex 32` |

The CLI REPL and `sync:garmin` still act on one seeded "owner" user, looked
up by email in `src/core/owner.ts`. The web UI is real multi-user: anyone who
signs in with Google gets their own row in `users`, created on first login.

## Run

```bash
npm start          # CLI REPL, run once
npm run dev         # CLI REPL, watch mode

npm run serve       # HTTP/SSE server, run once
npm run serve:dev    # HTTP/SSE server, watch mode
npm run serve:prod   # HTTP/SSE server, no --env-file (for prod hosts that inject env vars, e.g. Railway)

npm run web:dev      # Vite dev server for the React UI (proxies API calls to :3000)
npm run build        # builds the React UI into src/interfaces/server/public/
```

For local development, run `npm run serve:dev` and `npm run web:dev` side by
side — the web UI dev server (Vite) proxies `/auth`, `/personas`, `/sessions`,
and `/plans` to the API on port 3000. For production, `npm run build` builds
the UI straight into `src/interfaces/server/public/`, which the server serves
statically at `/`; Railway's Nixpacks build runs this automatically via the
root `build` script.

### Google sign-in setup

1. In Google Cloud Console, create an OAuth 2.0 Client ID (Web application).
2. Add your dev/prod origins (e.g. `http://localhost:5173`, `https://<your-domain>`) to "Authorized JavaScript origins".
3. Set `GOOGLE_CLIENT_ID` in `.env` (backend) and `VITE_GOOGLE_CLIENT_ID` in `web/.env` (frontend) to the same client id.

The server listens on `PORT` (default 3000), serves the built web UI at `/`,
and exposes:

- `POST /auth/google` — exchange a Google ID token for a session cookie
- `GET /auth/me` / `POST /auth/logout`
- `GET /personas` — list the signed-in user's personas
- `GET /sessions` — list the signed-in user's past chat sessions
- `POST /sessions` — create a session, optionally `{ "personaId": "..." }`
- `GET /sessions/:id` — resume a session (persona + full message history)
- `POST /sessions/:id/persona` — switch a session's active persona
- `POST /sessions/:id/messages` — send `{ "text": "..." }`, streams the reply back as SSE (`meta`, `chunk`, `done`/`error` events)
- `GET /plans` — list saved plans (persona + date) for the signed-in user
- `GET /plans/:personaId/:date` — a plan's full version history

Chat sessions/messages persist to Postgres (`chat_sessions`/`chat_messages`),
scoped per user, so history survives restarts and works across devices.
Deployed via Railway (`railway.json`: Nixpacks build, `npm run serve:prod`).

## Structure

```
migrations/                sequential *.sql files, applied in filename order by db:migrate
src/
  core/                    provider-agnostic session logic shared by both interfaces
    db.ts                    lazy Postgres pool (parses Neon's connection string)
    migrate.ts               runs migrations/*.sql
    owner.ts                 resolves the single seeded owner user by email (CLI / sync:garmin only)
    auth.ts                  Google ID token verification, user upsert, session-cookie JWT sign/verify
    bootstrap.ts             loadCore(userId): loads personas + profile from Postgres for one user
    userContextCache.ts      caches each web user's CoreContext (personas/tools) after first load
    session.ts               create/resume a session, switch persona, send a message -> stream
    sessionStore.ts           in-memory Map<sessionId, Session>, used by the CLI interface
    chatSessionStore.ts       Postgres-backed session/message store, used by the HTTP interface
    userMessage.ts           builds the outgoing message sent to the model
    defaults.ts               centralized default values (provider, persona, models, retry)
  interfaces/
    cli/                     terminal entrypoint
      index.ts                 loads core context + blocklist, starts the REPL
      repl.ts                   the readline loop: dispatches parsed commands, no parsing/printing logic of its own
      input/
        parseInput.ts            raw line -> typed Command (empty/quit/help/switchPersona/report/mail/message/rejected)
        wordFilter.ts            blocklist loading (resources/blocklist.txt) + offensive-language check
        commands.ts              the Command union + known-command list
      output/
        types.ts                 OutputSink interface
        consoleSink.ts           streams a reply to stdout token-by-token (default)
        reportSink.ts            buffers a reply and saves it as markdown to reports/ (used by /report)
        mailSink.ts              buffers a reply and emails it (used by /mail)
    server/                  HTTP entrypoint
      index.ts                  Fastify app: auth + personas + sessions + plans routes, serves public/
      public/                    built React UI (generated by `npm run build`; gitignored)
web/                        React + TypeScript + Vite source for the web UI (Google sign-in, chat, plans)
  src/
    main.tsx / App.tsx         router + auth-gated shell (top bar, tabs)
    lib/api.ts                 typed fetch client + SSE reader for the backend above
    lib/AuthContext.tsx        current-user state, backed by /auth/me
    pages/                     Login, Chat, Plans
  domain/
    personas/                loads persona rows (+ referenced_documents) from Postgres
    profile/                 loads the athlete_profiles row from Postgres (location, ...)
    context/
      types.ts                  ContextProvider interface ({ id, load(): Promise<string> })
      dbContextProvider.ts      resolves a persona's <referencedDocuments> entries against Postgres
    tools/                   model-callable tools (sleep, activities, weather, profile, plan store)
  integrations/
    garmin/
      types.ts                 MetricRow / ActivityRow / MetricCategoryRecord / WorkoutsRecord shapes
      parse.ts                  pure Garmin-payload -> row parsers (sleep, weight, steps, activity)
      categories.ts              taxonomy of collected data types (sleep, recovery, body, movement, workouts) + groupMetricsByCategory()
      localStore.ts              upserts into garmin_metrics / garmin_activities (Postgres)
      sync.ts                    login + per-day pull via garmin-connect, with rate-limit backoff
      cli.ts                     entrypoint for `npm run sync:garmin`
    llm/
      index.ts                 selects the active provider (LLM_PROVIDER env var) and creates chat sessions
      types.ts, gemini.ts, openai.ts, ollama.ts, retry.ts
    mail/                    outbound email (used by /mail and send:mail)
    planStore/               versioned plan storage in Postgres (plans / plan_versions tables)
  shared/
    xml.ts                   small XML-parsing helpers
resources/
  blocklist.txt           offensive-language phrase list (still file-based, loaded at CLI startup)
reports/                 markdown reports saved by /report (created on first use)
```

## Garmin sync

```bash
npm run sync:garmin -- [days] [--force]   # e.g. npm run sync:garmin -- 7 --force
```

Requires `GARMIN_USERNAME` / `GARMIN_PASSWORD` in `.env`. Logs into Garmin
Connect, pulls the last `days` days of sleep/weight/steps plus the 30 most
recent activities, and upserts them into `garmin_metrics` (one row per
date+metric, categorized via `src/integrations/garmin/categories.ts`:
**sleep**, **recovery**, **body**, **movement**) and `garmin_activities`
(one row per `activity_id`, category **workouts**). Without `--force`, the
sync is skipped entirely if today already has a `sleep_duration` row, to
avoid an unnecessary Garmin login.

A persona's `<referencedDocuments>` (`personas.referenced_documents` in
Postgres) lists the documents it should see — resolved by
`domain/context/dbContextProvider.ts` against Postgres tables (weight/food
list/supplements/templates/other personas). Garmin metrics/activities aren't
wired into any persona's referenced documents yet; they're currently only
reachable via the model tools in `domain/tools/`.

A persona can also declare dynamic context, resolved fresh at session-creation
time (not baked in at load time) — e.g. `<dynamicContext type="weather" />`
appends the current conditions for the profile's location.

## Usage

- Type a message to chat with the current persona (or the base model if none loaded).
- `@persona-id` — switch to a persona (loaded from Postgres at startup).
- `/report <topic>` — same as a message, but the reply isn't streamed to the console; it's saved as `reports/{persona}_{timestamp}.md`.
- `/mail <email> <topic>` — same as `/report`, but emails the reply instead of saving it.
- `/help` — list commands.
- `/quit` — exit.
