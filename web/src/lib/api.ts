export interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PersonaSummary {
  id: string;
  title: string;
}

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

export interface PlanSummary {
  personaId: string;
  personaTitle: string;
  date: string;
  latestVersion: number;
  updatedAt: string;
}

export interface PlanVersion {
  version: number;
  content: string;
  savedAt: string;
}

export interface PlanRecord {
  personaId: string;
  date: string;
  versions: PlanVersion[];
}

class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request to ${path} failed (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  googleLogin: (idToken: string) =>
    request<{ user: User }>("/auth/google", { method: "POST", body: JSON.stringify({ idToken }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => request<{ user: User }>("/auth/me"),

  personas: () => request<PersonaSummary[]>("/personas"),

  sessions: () => request<SessionSummary[]>("/sessions"),
  createSession: (personaId?: string) =>
    request<{ sessionId: string; persona: PersonaSummary }>("/sessions", {
      method: "POST",
      body: JSON.stringify(personaId ? { personaId } : {}),
    }),
  getSession: (id: string) =>
    request<{ persona: PersonaSummary | null; messages: StoredMessage[] }>(`/sessions/${id}`),
  switchPersona: (id: string, personaId: string) =>
    request<{ persona: PersonaSummary }>(`/sessions/${id}/persona`, {
      method: "POST",
      body: JSON.stringify({ personaId }),
    }),

  plans: () => request<PlanSummary[]>("/plans"),
  plan: (personaId: string, date: string) => request<PlanRecord>(`/plans/${personaId}/${date}`),
};

export { ApiError };

/** Streams a message reply via SSE, invoking callbacks as events arrive. */
export async function streamMessage(
  sessionId: string,
  text: string,
  handlers: { onChunk: (text: string) => void; onError: (message: string) => void }
): Promise<void> {
  const res = await fetch(`/sessions/${sessionId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) {
    handlers.onError("Failed to send message.");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const raw of events) {
      let event = "message";
      let data = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data);

      if (event === "chunk") handlers.onChunk(payload.text ?? "");
      else if (event === "error") handlers.onError(payload.error ?? "Unknown error.");
    }
  }
}
