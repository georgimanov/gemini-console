# Gemini Console Dojo

A small terminal chat REPL over Gemini, OpenAI, or Ollama with swappable coaching personas.

## Run

```bash
npm start        # run once
npm run dev       # watch mode
```

Set `LLM_PROVIDER` in `.env` to `gemini` (default), `openai`, or `ollama`.

## Structure

```
index.ts              entrypoint — loads personas/blocklist, starts the REPL
src/
  repl.ts              the readline loop: dispatches parsed commands, no parsing/printing logic of its own
  personas.ts          loads resources/personas/*.xml into system-instruction text
  profile.ts           loads resources/profile.xml (athlete profile: location, ...)
  userMessage.ts        builds the outgoing message sent to the model
  defaults.ts           centralized default values (provider, persona, models, retry)
  input/
    parseInput.ts        raw line -> typed Command (empty/quit/help/switchPersona/report/message/rejected)
    wordFilter.ts         blocklist loading + offensive-language check
    commands.ts           the Command union + known-command list
  output/
    types.ts              OutputSink interface
    consoleSink.ts         streams a reply to stdout token-by-token (default)
    reportSink.ts          buffers a reply and saves it as markdown to reports/ (used by /report)
  context/
    types.ts               ContextProvider interface ({ id, load(): Promise<string> })
    fileContextProvider.ts  resolves a persona's <referencedDocuments> against resources/ (static, load-time)
    weatherContextProvider.ts  fetches current weather via Open-Meteo for the profile's location (dynamic, session-time)
  garmin/
    types.ts                MetricRow / ActivityRow / DayRecord shapes
    parse.ts                 pure Garmin-payload -> row parsers (sleep, weight, steps, activity)
    categories.ts             taxonomy of collected data types (sleep, recovery, body, movement, workouts) + groupMetricsByCategory()
    localStore.ts             reads/writes resources/data/garmin/YYYY-MM-DD.json (merge-on-write, no DB)
    sync.ts                   login + per-day pull via garmin-connect, with rate-limit backoff
    cli.ts                     entrypoint for `npm run sync:garmin`
  llm/
    index.ts               selects the active provider (LLM_PROVIDER env var) and creates chat sessions
    types.ts, gemini.ts, openai.ts, ollama.ts, retry.ts
resources/
  personas/             persona definitions (XML)
  profile.xml            athlete profile (location, ...) used by dynamic context providers
  data/                   weight/sleep/food/supplement logs
    garmin/                 one JSON file per category per day ({category}_{date}.json), written by sync:garmin
  templates/              markdown templates (meal plan, morning task)
  blocklist.txt           offensive-language phrase list
reports/                 markdown reports saved by /report (created on first use)
```

## Garmin sync

```bash
npm run sync:garmin -- [days] [--force]   # e.g. npm run sync:garmin -- 7 --force
```

Requires `GARMIN_USERNAME` / `GARMIN_PASSWORD` in `.env`. Logs into Garmin
Connect, pulls the last `days` days of sleep/weight/steps plus the 30 most
recent activities, and writes one file per **category** per date to
`resources/data/garmin/{category}_{date}.json` (created/merged, not
overwritten wholesale — re-running is idempotent). Categories, defined in
`src/garmin/categories.ts`: **sleep** (score, stages, awake time),
**recovery** (HRV, resting HR, respiration, SpO2), **body** (weight, body fat
%), **movement** (steps), and **workouts** (the activities map, keyed by
`activityId`). A given day only gets the files it has data for — e.g. no
`body_*.json` on days without a logged weight. Without `--force`, the sync is
skipped entirely if `sleep_{today}.json` already has sleep data, to avoid an
unnecessary Garmin login. This data isn't wired into any persona's
`<referencedDocuments>` yet — `data/garmin/*` would pull in every category
file (referencedDocuments only expands a trailing `/*` to "every file in that
directory", it doesn't support per-category globs like `sleep_*`), the same
way `data/sleep.csv` is referenced today.

Each persona's `<referencedDocuments>` lists the files it should see (a
trailing `dir/*` pulls in everything currently in that directory). Entries
pointing at files that don't exist yet are skipped silently, so personas can
be written ahead of the data.

A persona can also declare dynamic context, resolved fresh at session-creation
time (not baked in at load time) — e.g. `<dynamicContext type="weather" />`
appends the current conditions for the profile's location.

## Usage

- Type a message to chat with the current persona (or the base model if none loaded).
- `@persona-id` — switch to a persona from `resources/personas/`.
- `/report <topic>` — same as a message, but the reply isn't streamed to the console; it's saved as `reports/{persona}_{timestamp}.md`.
- `/help` — list commands.
- `/quit` — exit.
