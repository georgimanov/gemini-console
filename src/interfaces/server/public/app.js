const personaSelect = document.getElementById("persona-select");
const messagesEl = document.getElementById("messages");
const composer = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");

let sessionId = null;
let sending = false;

function addBubble(role, text) {
  const el = document.createElement("div");
  el.className = `bubble ${role}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function setSending(state) {
  sending = state;
  sendBtn.disabled = state;
  input.disabled = state;
}

async function loadPersonas() {
  const res = await fetch("/personas");
  const personas = await res.json();
  personaSelect.innerHTML = "";
  for (const p of personas) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.title;
    personaSelect.appendChild(opt);
  }
  return personas;
}

async function createSession(personaId) {
  const res = await fetch("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(personaId ? { personaId } : {}),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create session");
  const data = await res.json();
  sessionId = data.sessionId;
  personaSelect.value = data.persona.id;
  return data;
}

async function switchPersona(personaId) {
  const res = await fetch(`/sessions/${sessionId}/persona`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personaId }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to switch persona");
  return res.json();
}

async function sendMessage(text) {
  const res = await fetch(`/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) {
    throw new Error("Failed to send message");
  }

  const assistantBubble = addBubble("assistant", "");
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
      const lines = raw.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data);

      if (event === "chunk") {
        assistantBubble.textContent += payload.text ?? "";
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (event === "error") {
        assistantBubble.classList.add("system");
        assistantBubble.textContent = `Error: ${payload.error}`;
      }
    }
  }

  if (!assistantBubble.textContent) {
    assistantBubble.remove();
  }
}

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || sending || !sessionId) return;

  addBubble("user", text);
  input.value = "";
  input.style.height = "auto";
  setSending(true);
  try {
    await sendMessage(text);
  } catch (error) {
    addBubble("system", error.message ?? String(error));
  } finally {
    setSending(false);
    input.focus();
  }
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
});

personaSelect.addEventListener("change", async () => {
  if (!sessionId) return;
  try {
    await switchPersona(personaSelect.value);
    messagesEl.innerHTML = "";
    addBubble("system", `Switched persona to ${personaSelect.options[personaSelect.selectedIndex].text}`);
  } catch (error) {
    addBubble("system", error.message ?? String(error));
  }
});

(async function init() {
  try {
    setSending(true);
    await loadPersonas();
    await createSession(personaSelect.value || undefined);
    addBubble("system", `Session started with ${personaSelect.options[personaSelect.selectedIndex].text}`);
  } catch (error) {
    addBubble("system", error.message ?? String(error));
  } finally {
    setSending(false);
  }
})();
