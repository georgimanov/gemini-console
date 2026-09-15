import { GoogleGenAI, createPartFromFunctionResponse, type Chat, type Part } from "@google/genai";
import { Defaults } from "../../app/defaults.js";
import type { Tool } from "../../domain/tools/types.js";
import type { ChatSession, LlmProvider } from "./types.js";

/** Gemini provider backed by @google/genai. */
export function createGeminiProvider(
  model = process.env.LLM_MODEL ?? Defaults.MODEL.gemini
): LlmProvider {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  return {
    createChatSession(systemInstruction?: string, tools: Tool[] = []): ChatSession {
      const toolsByName = new Map(tools.map((t) => [t.name, t]));

      const chat = ai.chats.create({
        model,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(tools.length > 0
            ? {
                tools: [
                  {
                    functionDeclarations: tools.map((t) => ({
                      name: t.name,
                      description: t.description,
                      parametersJsonSchema: t.parameters,
                    })),
                  },
                ],
              }
            : {}),
        },
      });

      return {
        sendMessageStream: (message: string) => streamTurn(chat, message, toolsByName),
      };
    },
  };
}

/**
 * Streams one user turn. If the model calls tools instead of (or in addition to)
 * replying, executes them and feeds the results back, looping until the model
 * produces a final text reply.
 */
async function streamTurn(
  chat: Chat,
  message: string | Part[],
  toolsByName: Map<string, Tool>
): Promise<AsyncIterable<{ text: string }>> {
  return {
    async *[Symbol.asyncIterator]() {
      let nextMessage: string | Part[] = message;

      while (true) {
        const stream = await chat.sendMessageStream({ message: nextMessage });
        const calls: { id?: string; name: string; args: Record<string, unknown> }[] = [];

        for await (const chunk of stream) {
          const functionCalls = chunk.functionCalls ?? [];
          // Accessing chunk.text on a function-call-only chunk logs an SDK warning, so skip it.
          if (functionCalls.length === 0 && chunk.text) yield { text: chunk.text };
          for (const call of functionCalls) {
            if (call.name) calls.push({ id: call.id, name: call.name, args: call.args ?? {} });
          }
        }

        if (calls.length === 0) return;

        const responseParts: Part[] = [];
        for (const call of calls) {
          const tool = toolsByName.get(call.name);
          const result = tool
            ? await tool.execute(call.args)
            : `Unknown tool "${call.name}".`;
          responseParts.push(
            createPartFromFunctionResponse(call.id ?? call.name, call.name, { output: result })
          );
        }
        nextMessage = responseParts;
      }
    },
  };
}
