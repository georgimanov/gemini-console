import OpenAI from "openai";
import { Defaults } from "../defaults.js";
import type { ChatSession, LlmProvider } from "./types.js";

type Message = { role: "system" | "user" | "assistant"; content: string };

/** OpenAI provider backed by the Chat Completions API, with session history kept in-process. */
export function createOpenAiProvider(
  model = process.env.LLM_MODEL ?? Defaults.MODEL.openai
): LlmProvider {
  const client = new OpenAI({ apiKey: process.env.OPEN_AI_API_KEY });

  return {
    createChatSession(systemInstruction?: string): ChatSession {
      const history: Message[] = systemInstruction
        ? [{ role: "system", content: systemInstruction }]
        : [];

      return {
        async sendMessageStream(message: string) {
          history.push({ role: "user", content: message });

          const stream = await client.chat.completions.create({
            model,
            messages: history,
            stream: true,
          });

          let assistantReply = "";

          return {
            async *[Symbol.asyncIterator]() {
              for await (const part of stream) {
                const text = part.choices[0]?.delta?.content ?? "";
                if (text) {
                  assistantReply += text;
                  yield { text };
                }
              }
              history.push({ role: "assistant", content: assistantReply });
            },
          };
        },
      };
    },
  };
}
