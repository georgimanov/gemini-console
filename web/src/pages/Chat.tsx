import { useEffect, useRef, useState } from "react";
import { api, streamMessage, type PersonaSummary } from "../lib/api.js";

interface DisplayMessage {
  role: "user" | "model" | "system";
  text: string;
}

export function Chat() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [personaId, setPersonaId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.personas();
        setPersonas(list);
        const created = await api.createSession(list[0]?.id);
        setSessionId(created.sessionId);
        setPersonaId(created.persona.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function handlePersonaChange(nextPersonaId: string) {
    if (!sessionId) return;
    try {
      await api.switchPersona(sessionId, nextPersonaId);
      setPersonaId(nextPersonaId);
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !sessionId || sending) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setSending(true);
    setError(null);

    let modelText = "";
    setMessages((prev) => [...prev, { role: "model", text: "" }]);

    await streamMessage(sessionId, text, {
      onChunk: (chunk) => {
        modelText += chunk;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "model", text: modelText };
          return next;
        });
      },
      onError: (message) => {
        setMessages((prev) => prev.slice(0, -1));
        setError(message);
      },
    });

    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-page__controls">
        <select
          className="select"
          value={personaId}
          onChange={(e) => handlePersonaChange(e.target.value)}
          disabled={!sessionId}
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="message-list" ref={listRef}>
        {messages.length === 0 && !error && <div className="empty-state">Say hello to get started.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.role}`}>
            {m.text}
          </div>
        ))}
      </div>

      <div className="composer">
        <textarea
          rows={1}
          placeholder="Message your coach…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!sessionId || sending}
        />
        <button className="btn btn--primary" onClick={handleSend} disabled={!sessionId || sending || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
