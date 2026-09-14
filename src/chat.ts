import { GoogleGenAI, type Chat } from "@google/genai";

const MODEL = "gemini-3.6-flash";

const ai = new GoogleGenAI({});

/** Creates a new chat session, optionally scoped to a persona's system instruction. */
export function createChatSession(systemInstruction?: string): Chat {
  return ai.chats.create({
    model: MODEL,
    ...(systemInstruction ? { systemInstruction } : {}),
  });
}
