import type { Persona } from "../domain/personas/index.js";

/** Builds the outgoing message sent to the model: the raw user input plus enrichment tags (persona, ...). */
export function buildUserMessage(message: string, persona: Persona | null): string {
  const personaTag = persona ? `[Using persona: ${persona.title}] ` : "";
  return `${personaTag}${message}`;
}
