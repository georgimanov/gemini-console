import type { Persona } from "./types.js";
import { buildTemporalContext } from "./temporal.js";

/**
 * A persona's full system instruction: static context plus a fresh temporal context
 * line. Call this at chat-session creation, not once at load time, so "now" doesn't go
 * stale over a long-running process. Sleep/activities/weather/profile data is no longer
 * injected here — it's fetched on demand via tools (see src/tools) when the model
 * decides it needs it.
 */
export function buildSystemInstruction(persona: Persona): string {
  return [persona.context, buildTemporalContext()].join("\n\n");
}
