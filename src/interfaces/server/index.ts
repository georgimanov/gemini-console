import Fastify from "fastify";
import { loadCore } from "../../core/bootstrap.js";
import { switchPersona, sendMessage } from "../../core/session.js";
import { createSessionStore } from "../../core/sessionStore.js";

const { personas, makeTools } = await loadCore();

if (personas.size === 0) {
  throw new Error("No personas available. Add a persona XML file to resources/personas.");
}

const store = createSessionStore(personas, makeTools);

const app = Fastify({ logger: true });

app.get("/personas", async () => {
  return Array.from(personas.values()).map((p) => ({ id: p.id, title: p.title }));
});

app.post<{ Body: { personaId?: string } }>("/sessions", async (request, reply) => {
  const { personaId } = request.body ?? {};
  if (personaId && !personas.has(personaId)) {
    return reply.code(400).send({ error: `Unknown persona "${personaId}".` });
  }
  const { id, session } = store.create(personaId);
  return { sessionId: id, persona: { id: session.currentPersona!.id, title: session.currentPersona!.title } };
});

app.post<{ Params: { id: string }; Body: { personaId: string } }>(
  "/sessions/:id/persona",
  async (request, reply) => {
    const session = store.get(request.params.id);
    if (!session) return reply.code(404).send({ error: "Session not found." });

    try {
      switchPersona(session, request.body.personaId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return reply.code(400).send({ error: reason });
    }
    return { persona: { id: session.currentPersona!.id, title: session.currentPersona!.title } };
  }
);

app.post<{ Params: { id: string }; Body: { text: string } }>("/sessions/:id/messages", async (request, reply) => {
  const session = store.get(request.params.id);
  if (!session) return reply.code(404).send({ error: "Session not found." });

  const text = request.body?.text;
  if (!text || !text.trim()) {
    return reply.code(400).send({ error: "Body must include non-empty \"text\"." });
  }

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    const { stream, meta } = await sendMessage(session, text);
    reply.raw.write(`event: meta\ndata: ${JSON.stringify(meta)}\n\n`);
    for await (const chunk of stream) {
      reply.raw.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk.text ?? "" })}\n\n`);
    }
    reply.raw.write("event: done\ndata: {}\n\n");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: reason })}\n\n`);
  }

  reply.raw.end();
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
