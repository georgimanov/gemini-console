import type { Persona } from "../domain/personas/index.js";
import { buildSystemInstruction } from "../domain/personas/index.js";
import {
  createChatSession,
  withRetry,
  activeProviderName,
  type ChatHistoryTurn,
  type ChatSession,
} from "../integrations/llm/index.js";
import type { PersonaState } from "../domain/tools/registry.js";
import type { Tool } from "../domain/tools/types.js";
import { buildUserMessage } from "./userMessage.js";

/** One user's conversation: the active persona and the chat session scoped to it. */
export interface Session {
  personas: Map<string, Persona>;
  tools: Tool[];
  personaState: PersonaState;
  currentPersona: Persona | null;
  chat: ChatSession;
}

/**
 * Creates a session on the given persona (or the map's first persona if omitted).
 * `history` resumes a session with turns saved in an earlier process instead of starting fresh.
 */
export function createSession(
  personas: Map<string, Persona>,
  tools: Tool[],
  personaState: PersonaState,
  personaId?: string,
  history?: ChatHistoryTurn[]
): Session {
  const persona = (personaId ? personas.get(personaId) : undefined) ?? personas.values().next().value!;
  personaState.id = persona.id;
  return {
    personas,
    tools,
    personaState,
    currentPersona: persona,
    chat: createChatSession(buildSystemInstruction(persona), tools, history),
  };
}

/** Switches a session's active persona, starting a fresh chat scoped to it. */
export function switchPersona(session: Session, personaId: string): Session {
  const persona = session.personas.get(personaId);
  if (!persona) {
    throw new Error(`Unknown persona "${personaId}".`);
  }
  session.currentPersona = persona;
  session.personaState.id = persona.id;
  session.chat = createChatSession(buildSystemInstruction(persona), session.tools);
  return session;
}

/** Sends a message on the session's active chat and returns the streamed reply. */
export async function sendMessage(session: Session, text: string) {
  const userMessage = buildUserMessage(text, session.currentPersona);
  const stream = await withRetry(() => session.chat.sendMessageStream(userMessage));
  return {
    stream,
    meta: {
      provider: activeProviderName,
      personaTitle: session.currentPersona?.title ?? "no persona",
      personaId: session.currentPersona?.id ?? null,
    },
  };
}
