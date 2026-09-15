import type { Persona } from "./types.js";
import { buildTemporalContext } from "./temporal.js";

/**
 * A persona's full system instruction: static context, a fresh temporal context line,
 * and any dynamic providers (e.g. weather) resolved fresh. Call this at chat-session
 * creation, not once at load time, so time and dynamic context don't go stale over a
 * long-running process.
 */
export async function buildSystemInstruction(persona: Persona): Promise<string> {
  const dynamicSections = await Promise.all(persona.dynamicProviders.map((p) => p.load()));
  return [persona.context, buildTemporalContext(), ...dynamicSections.filter(Boolean)].join("\n\n");
}
