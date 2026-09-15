import { appendPlanVersion, readPlan, latestVersion } from "../../integrations/planStore/store.js";
import type { Tool } from "./types.js";

/** Tracks which persona is active so the plan-store tools can scope reads/writes to it. */
export interface PersonaState {
  id: string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Exposes previously saved plans (see createSavePlanTool/createUpdatePlanTool) as a callable tool. */
export function createGetSavedPlanTool(dataDir: string, persona: PersonaState): Tool {
  return {
    name: "get_saved_plan",
    description:
      "Returns the plan/report already generated and saved for the current persona on a given date " +
      "(default today), or a message saying none is saved. ALWAYS call this before building a new plan " +
      "from a template (e.g. morning briefing, meal plan) — if one is already saved for the date, present " +
      "it to the user as-is instead of generating a new one, unless the user explicitly asks for a fresh " +
      "or updated version. Also call this before editing a plan, so you have its current content and " +
      "version number to work from.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: 'Date as "YYYY-MM-DD". Defaults to today.' },
        version: {
          type: "number",
          description: "Specific version number to retrieve. Defaults to the latest version.",
        },
      },
    },
    async execute(args) {
      if (!persona.id) return "No persona is active.";
      const date = typeof args.date === "string" && args.date ? args.date : today();
      const record = await readPlan(dataDir, persona.id, date);
      if (!record || record.versions.length === 0) return `No plan has been saved for ${date}.`;

      const requested = typeof args.version === "number" ? args.version : null;
      const found = requested !== null ? record.versions.find((v) => v.version === requested) : latestVersion(record);
      if (!found) return `No version ${requested} found for ${date}. Latest is v${record.versions.length}.`;

      return `[v${found.version} of ${record.versions.length}, saved ${found.savedAt}]\n\n${found.content}`;
    },
  };
}

/** Exposes plan persistence (see createGetSavedPlanTool) as a callable tool. Use for the first save of the day. */
export function createSavePlanTool(dataDir: string, persona: PersonaState): Tool {
  return {
    name: "save_plan",
    description:
      "Saves the plan/report you just generated from a template so it can be reused if the user asks " +
      "again on the same day. Call this once, right after building a NEW plan for a date that doesn't " +
      "already have one (e.g. morning briefing, meal plan) — not for ordinary chat replies. If a plan for " +
      "that date already exists and the user wants a change, use update_plan instead so the history is kept.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The full plan/report text to save, exactly as presented to the user." },
        date: { type: "string", description: 'Date as "YYYY-MM-DD". Defaults to today.' },
      },
      required: ["content"],
    },
    async execute(args) {
      if (!persona.id) return "No persona is active.";
      const content = typeof args.content === "string" ? args.content : "";
      if (!content.trim()) return "Nothing to save: content was empty.";
      const date = typeof args.date === "string" && args.date ? args.date : today();
      const version = await appendPlanVersion(dataDir, persona.id, date, content);
      return `Saved plan for ${date} as v${version.version}.`;
    },
  };
}

/** Saves an edited plan as a new version, preserving earlier versions (see createGetSavedPlanTool). */
export function createUpdatePlanTool(dataDir: string, persona: PersonaState): Tool {
  return {
    name: "update_plan",
    description:
      "Saves a revised plan as a new version when the user asks to change something in an already-saved " +
      "plan (e.g. swap priorities, adjust a meal, change the schedule) — the previous version is kept, not " +
      "overwritten. Fetch the current content with get_saved_plan first, produce the full corrected plan " +
      "text yourself, then pass that complete text here (not just the changed part).",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The full, updated plan/report text (the whole plan, not just the edited section).",
        },
        date: { type: "string", description: 'Date as "YYYY-MM-DD". Defaults to today.' },
      },
      required: ["content"],
    },
    async execute(args) {
      if (!persona.id) return "No persona is active.";
      const content = typeof args.content === "string" ? args.content : "";
      if (!content.trim()) return "Nothing to save: content was empty.";
      const date = typeof args.date === "string" && args.date ? args.date : today();
      const version = await appendPlanVersion(dataDir, persona.id, date, content);
      return `Saved edited plan for ${date} as v${version.version}.`;
    },
  };
}
