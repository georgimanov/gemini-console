import { GoogleGenAI } from "@google/genai";
import { Defaults } from "../defaults.js";
import type { ChatSession, LlmProvider } from "./types.js";

/** Gemini provider backed by @google/genai. */
export function createGeminiProvider(
  model = process.env.LLM_MODEL ?? Defaults.MODEL.gemini
): LlmProvider {
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
