import { randomUUID } from "node:crypto";
import { getPool } from "./db.js";
import { getUserContext } from "./userContextCache.js";
import { createSession, switchPersona as switchSessionPersona, type Session } from "./session.js";
import type { ChatHistoryTurn } from "../integrations/llm/index.js";
import { Defaults } from "./defaults.js";

/**
 * Chat transcripts live in Postgres (chat_sessions/chat_messages) so history survives restarts
 * and is visible across devices; the live LLM chat object underneath a Session can't be
 * serialized, so it's kept in this in-memory map for the lifetime of the process and rebuilt
 * (by replaying stored messages as history) the first time a session is touched after a restart.
 */
const liveSessions = new Map<string, { userId: string; session: Session }>();

export interface SessionSummary {
  id: string;
  personaId: string;
  personaTitle: string;
  createdAt: string;
  lastActiveAt: string;
  lastMessage: string | null;
}

export interface StoredMessage {
  role: "user" | "model";
  content: string;
  createdAt: string;
}

/** Creates a new session for this user, persisted to Postgres and cached live in-process. */
export async function createChatSession(
  userId: string,
  personaId?: string
): Promise<{ id: string; session: Session }> {
  const context = await getUserContext(userId);
  if (context.personas.size === 0) {
    throw new Error("No personas available for this user.");
  }

  const resolvedPersonaId = (personaId && context.personas.has(personaId) ? personaId : undefined) ?? Defaults.PERSONA_ID;
  const persona = context.personas.get(resolvedPersonaId) ?? context.personas.values().next().value!;

  const personaState = { id: null };
  const tools = context.makeTools(personaState);
  const session = createSession(context.personas, tools, personaState, persona.id);

  const id = randomUUID();
  await getPool().query(
    `insert into chat_sessions (id, user_id, persona_id)
     values ($1, $2, (select id from personas where user_id = $2 and slug = $3))`,
    [id, userId, persona.id]
  );

  liveSessions.set(id, { userId, session });
  return { id, session };
}

/** Fetches a session (from the live cache, or rebuilt from stored history), verifying it belongs to this user. */
export async function getChatSession(userId: string, sessionId: string): Promise<Session | undefined> {
  const live = liveSessions.get(sessionId);
  if (live) {
    return live.userId === userId ? live.session : undefined;
  }

  const rowResult = await getPool().query<{ persona_slug: string | null }>(
    `select per.slug as persona_slug
     from chat_sessions cs
     left join personas per on per.id = cs.persona_id
     where cs.id = $1 and cs.user_id = $2`,
    [sessionId, userId]
  );
  const row = rowResult.rows[0];
  if (!row) return undefined;

  const context = await getUserContext(userId);
  const personaId = row.persona_slug && context.personas.has(row.persona_slug) ? row.persona_slug : undefined;

  const messages = await loadMessages(sessionId);
  const history: ChatHistoryTurn[] = messages.map((m) => ({ role: m.role, text: m.content }));

  const personaState = { id: null };
  const tools = context.makeTools(personaState);
  const session = createSession(context.personas, tools, personaState, personaId, history);

  liveSessions.set(sessionId, { userId, session });
  return session;
}

/** Switches a live session's persona and records the change on its Postgres row. */
export async function switchChatSessionPersona(sessionId: string, personaId: string): Promise<void> {
  const live = liveSessions.get(sessionId);
  if (!live) throw new Error("Session not found.");

  switchSessionPersona(live.session, personaId);
  await getPool().query(
    `update chat_sessions
     set persona_id = (select id from personas where user_id = $2 and slug = $3)
     where id = $1`,
    [sessionId, live.userId, personaId]
  );
}

/** Appends one turn to a session's stored transcript. */
export async function appendMessage(sessionId: string, role: "user" | "model", content: string): Promise<void> {
  await getPool().query(
    `insert into chat_messages (session_id, role, content) values ($1, $2, $3)`,
    [sessionId, role, content]
  );
  await getPool().query(`update chat_sessions set last_active_at = now() where id = $1`, [sessionId]);
}

/** The full stored transcript for a session, oldest first. */
export async function loadMessages(sessionId: string): Promise<StoredMessage[]> {
  const result = await getPool().query<{ role: "user" | "model"; content: string; created_at: Date }>(
    `select role, content, created_at from chat_messages where session_id = $1 order by created_at`,
    [sessionId]
  );
  return result.rows.map((r) => ({ role: r.role, content: r.content, createdAt: r.created_at.toISOString() }));
}

/** Lists a user's past sessions, most recently active first, with a preview of the last message. */
export async function listChatSessions(userId: string): Promise<SessionSummary[]> {
  const result = await getPool().query<{
    id: string;
    persona_slug: string | null;
    persona_title: string | null;
    created_at: Date;
    last_active_at: Date;
    last_message: string | null;
  }>(
    `select cs.id,
            per.slug as persona_slug,
            per.title as persona_title,
            cs.created_at,
            cs.last_active_at,
            (select content from chat_messages cm where cm.session_id = cs.id order by cm.created_at desc limit 1) as last_message
     from chat_sessions cs
     left join personas per on per.id = cs.persona_id
     where cs.user_id = $1
     order by cs.last_active_at desc`,
    [userId]
  );

  return result.rows.map((r) => ({
    id: r.id,
    personaId: r.persona_slug ?? "",
    personaTitle: r.persona_title ?? "Unknown persona",
    createdAt: r.created_at.toISOString(),
    lastActiveAt: r.last_active_at.toISOString(),
    lastMessage: r.last_message,
  }));
}
