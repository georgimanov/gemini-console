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
  context.ts          stub — future home for merging resources/data + resources/templates
                       into a persona's context
resources/
  personas/           persona definitions (XML)
  data/                weight/sleep/food/supplement logs, not yet wired in
  templates/           markdown templates (meal plan, morning task), not yet wired in
```

## Usage

- Type a message to chat with the current persona (or the base model if none loaded).
- `@persona-id` — switch to a persona from `resources/personas/`.
- `/quit` — exit.
