import { isOffensive } from "./wordFilter.js";
import { KNOWN_COMMANDS, type Command } from "./commands.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParseContext {
  personaIds: Set<string>;
  blocklist: Set<string>;
}

/** Parses a raw input line into a validated, typed command. Nothing reaches the LLM unvalidated. */
export function parseInput(raw: string, ctx: ParseContext): Command {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { type: "empty" };
  }

  if (trimmed === "/quit") {
    return { type: "quit" };
  }

  if (trimmed === "/help") {
    return { type: "help" };
  }

  if (trimmed.startsWith("@")) {
    const personaId = trimmed.slice(1).toLowerCase();
    if (ctx.personaIds.has(personaId)) {
      return { type: "switchPersona", personaId };
    }
    return {
      type: "rejected",
      reason: `Persona not found: ${personaId}. Available: ${Array.from(ctx.personaIds).join(", ")}`,
    };
  }

  if (trimmed.startsWith("/report")) {
    const prompt = trimmed.slice("/report".length).trim();
    if (!prompt) {
      return { type: "rejected", reason: "Usage: /report <what to report on>" };
    }
    return { type: "report", prompt };
  }

  if (trimmed.startsWith("/mail")) {
    const rest = trimmed.slice("/mail".length).trim();
    const spaceIdx = rest.indexOf(" ");
    const to = spaceIdx === -1 ? rest : rest.slice(0, spaceIdx);
    const prompt = spaceIdx === -1 ? "" : rest.slice(spaceIdx + 1).trim();
    if (!to || !EMAIL_RE.test(to) || !prompt) {
      return { type: "rejected", reason: "Usage: /mail <email> <what to report on>" };
    }
    return { type: "mail", to, prompt };
  }

  if (trimmed.startsWith("/")) {
    return {
      type: "rejected",
      reason: `Unknown command. Available: ${KNOWN_COMMANDS.join(", ")}, @persona-name`,
    };
  }

  if (isOffensive(trimmed, ctx.blocklist)) {
    return { type: "rejected", reason: "Message rejected: please rephrase without offensive language." };
  }

  return { type: "message", text: trimmed };
}
