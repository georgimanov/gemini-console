import { GoogleGenAI } from "@google/genai";
import type { ChatSession, LlmProvider } from "./types.js";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

/** Gemini provider backed by @google/genai. */
export function createGeminiProvider(model = process.env.LLM_MODEL ?? DEFAULT_MODEL): LlmProvider {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  return {
    createChatSession(systemInstruction?: string): ChatSession {
      const chat = ai.chats.create({
        model,
        ...(systemInstruction ? { systemInstruction } : {}),
      });

      return {
        async sendMessageStream(message: string) {
          const stream = await chat.sendMessageStream({ message });
          return {
            async *[Symbol.asyncIterator]() {
              for await (const chunk of stream) {
                yield { text: chunk.text ?? "" };
              }
            },
          };
        },
      };
    },
  };
}
