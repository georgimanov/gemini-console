import { randomUUID } from "node:crypto";
import type { Persona } from "../domain/personas/index.js";
import type { Tool } from "../domain/tools/types.js";
import type { PersonaState } from "../domain/tools/registry.js";
import { createSession, type Session } from "./session.js";
import { Defaults } from "./defaults.js";

/**
 * In-memory session registry, keyed by session id. One process, no persistence —
 * the seam that a future multi-user/multi-device setup replaces with a real store.
 *
 * `makeTools` is called once per session (not shared): the plan-store tools close over
 * a PersonaState object at creation time, so each session needs its own instance —
 * otherwise sessions would clobber each other's active-persona scoping.
 */
export function createSessionStore(personas: Map<string, Persona>, makeTools: (personaState: PersonaState) => Tool[]) {
  const sessions = new Map<string, Session>();

  return {
    create(personaId?: string): { id: string; session: Session } {
      const id = randomUUID();
      const personaState: PersonaState = { id: null };
      const tools = makeTools(personaState);
      const session = createSession(personas, tools, personaState, personaId ?? Defaults.PERSONA_ID);
      sessions.set(id, session);
      return { id, session };
    },
    get(id: string): Session | undefined {
      return sessions.get(id);
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
