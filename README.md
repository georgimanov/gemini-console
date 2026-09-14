# Gemini Console Dojo

A small terminal chat REPL over Gemini with swappable coaching personas.

## Run

```bash
npm start        # run once
npm run dev       # watch mode
```

## Structure

```
index.ts            entrypoint — loads personas, starts the REPL
src/
  personas.ts        loads resources/personas/*.xml into system-instruction text
  chat.ts             creates Gemini chat sessions (model config lives here)
  repl.ts             the readline loop: /quit, @persona switching, streaming replies
  context.ts          resolves a persona's <referencedDocuments> against resources/
                       and loads their content into its system instruction
resources/
  personas/           persona definitions (XML)
  data/                weight/sleep/food/supplement logs
  templates/           markdown templates (meal plan, morning task)
```

Each persona's `<referencedDocuments>` lists the files it should see (a
trailing `dir/*` pulls in everything currently in that directory). Entries
pointing at files that don't exist yet are skipped silently, so personas can
be written ahead of the data.

## Usage

- Type a message to chat with the current persona (or the base model if none loaded).
- `@persona-id` — switch to a persona from `resources/personas/`.
- `/quit` — exit.
