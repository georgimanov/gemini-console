import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import FastifyStatic from "@fastify/static";
import FastifyCookie from "@fastify/cookie";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
  verifyGoogleIdToken,
  upsertGoogleUser,
  getUserById,
  signSessionToken,
  verifySessionToken,
} from "../../core/auth.js";
import { getPool } from "../../core/db.js";
import { getUserContext } from "../../core/userContextCache.js";
import {
  createChatSession,
  getChatSession,
  switchChatSessionPersona,
  appendMessage,
  loadMessages,
  listChatSessions,
} from "../../core/chatSessionStore.js";
import { sendMessage } from "../../core/session.js";
import { readPlan, listPlanSummaries } from "../../integrations/planStore/store.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

await app.register(FastifyCookie);
await app.register(FastifyStatic, {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

/** Resolves the session cookie into request.userId, or rejects with 401. */
async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[SESSION_COOKIE_NAME];
  const userId = token ? verifySessionToken(token) : null;
  if (!userId) {
    reply.code(401).send({ error: "Not authenticated." });
    return reply;
  }
  request.userId = userId;
}

// ── Auth ──────────────────────────────────────────────────

app.post<{ Body: { idToken?: string } }>("/auth/google", async (request, reply) => {
  const idToken = request.body?.idToken;
  if (!idToken) {
    return reply.code(400).send({ error: 'Body must include "idToken".' });
  }

  let profile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    request.log.warn({ err: error }, "Google ID token verification failed");
    return reply.code(401).send({ error: reason });
  }

  let user;
  try {
    user = await upsertGoogleUser(getPool(), profile);
  } catch (error) {
    request.log.error({ err: error }, "Failed to upsert user after Google sign-in");
    return reply.code(500).send({ error: "Failed to complete sign-in." });
  }

  const token = signSessionToken(user.id);
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_MS / 1000,
  });
  return { user };
});

app.post("/auth/logout", async (_request, reply) => {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  return { ok: true };
});

app.get("/auth/me", async (request, reply) => {
  const token = request.cookies[SESSION_COOKIE_NAME];
  const userId = token ? verifySessionToken(token) : null;
  if (!userId) return reply.code(401).send({ error: "Not authenticated." });

  const user = await getUserById(getPool(), userId);
  if (!user) return reply.code(401).send({ error: "Not authenticated." });
  return { user };
});

// ── Personas ──────────────────────────────────────────────

app.get("/personas", { preHandler: requireAuth }, async (request) => {
  const context = await getUserContext(request.userId);
  return Array.from(context.personas.values()).map((p) => ({ id: p.id, title: p.title }));
});

// ── Chat sessions ─────────────────────────────────────────

app.get("/sessions", { preHandler: requireAuth }, async (request) => {
  return listChatSessions(request.userId);
});

app.post<{ Body: { personaId?: string } }>("/sessions", { preHandler: requireAuth }, async (request, reply) => {
  const { personaId } = request.body ?? {};
  try {
    const { id, session } = await createChatSession(request.userId, personaId);
    return { sessionId: id, persona: { id: session.currentPersona!.id, title: session.currentPersona!.title } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return reply.code(400).send({ error: reason });
  }
});

app.get<{ Params: { id: string } }>("/sessions/:id", { preHandler: requireAuth }, async (request, reply) => {
  const session = await getChatSession(request.userId, request.params.id);
  if (!session) return reply.code(404).send({ error: "Session not found." });

  const messages = await loadMessages(request.params.id);
  return {
    persona: session.currentPersona ? { id: session.currentPersona.id, title: session.currentPersona.title } : null,
    messages,
  };
});

app.post<{ Params: { id: string }; Body: { personaId: string } }>(
  "/sessions/:id/persona",
  { preHandler: requireAuth },
  async (request, reply) => {
    const session = await getChatSession(request.userId, request.params.id);
    if (!session) return reply.code(404).send({ error: "Session not found." });

    try {
      await switchChatSessionPersona(request.params.id, request.body.personaId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return reply.code(400).send({ error: reason });
    }
    return { persona: { id: session.currentPersona!.id, title: session.currentPersona!.title } };
  }
);

app.post<{ Params: { id: string }; Body: { text: string } }>(
  "/sessions/:id/messages",
  { preHandler: requireAuth },
  async (request, reply) => {
    const session = await getChatSession(request.userId, request.params.id);
    if (!session) return reply.code(404).send({ error: "Session not found." });

    const text = request.body?.text;
    if (!text || !text.trim()) {
      return reply.code(400).send({ error: 'Body must include non-empty "text".' });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      await appendMessage(request.params.id, "user", text);

      const { stream, meta } = await sendMessage(session, text);
      reply.raw.write(`event: meta\ndata: ${JSON.stringify(meta)}\n\n`);

      let fullReply = "";
      for await (const chunk of stream) {
        const chunkText = chunk.text ?? "";
        fullReply += chunkText;
        reply.raw.write(`event: chunk\ndata: ${JSON.stringify({ text: chunkText })}\n\n`);
      }

      if (fullReply) {
        await appendMessage(request.params.id, "model", fullReply);
      }
      reply.raw.write("event: done\ndata: {}\n\n");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: reason })}\n\n`);
    }

    reply.raw.end();
  }
);

// ── Plans ─────────────────────────────────────────────────

app.get("/plans", { preHandler: requireAuth }, async (request) => {
  return listPlanSummaries(request.userId);
});

app.get<{ Params: { personaId: string; date: string } }>(
  "/plans/:personaId/:date",
  { preHandler: requireAuth },
  async (request, reply) => {
    const plan = await readPlan(request.userId, request.params.personaId, request.params.date);
    if (!plan) return reply.code(404).send({ error: "No plan found." });
    return plan;
  }
);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
