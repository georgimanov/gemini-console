import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { Defaults } from "../../core/defaults.js";
import type { Tool } from "../../domain/tools/types.js";
import type { ChatSession, LlmProvider } from "./types.js";

/** OpenAI provider backed by the Chat Completions API, with session history kept in-process. */
export function createOpenAiProvider(
  model = process.env.LLM_MODEL ?? Defaults.MODEL.openai
): LlmProvider {
  const client = new OpenAI({ apiKey: process.env.OPEN_AI_API_KEY });

  return {
    createChatSession(systemInstruction?: string, tools: Tool[] = []): ChatSession {
      const history: ChatCompletionMessageParam[] = systemInstruction
        ? [{ role: "system", content: systemInstruction }]
        : [];
      const toolsByName = new Map(tools.map((t) => [t.name, t]));
      const toolDefs: ChatCompletionTool[] | undefined =
        tools.length > 0
          ? tools.map((t) => ({
              type: "function" as const,
              function: { name: t.name, description: t.description, parameters: { ...t.parameters } },
            }))
          : undefined;

      return {
        async sendMessageStream(message: string) {
          history.push({ role: "user", content: message });
          return streamTurn(client, model, history, toolDefs, toolsByName);
        },
      };
    },
  };
}

/**
 * Streams one turn from `history` onward, appending the assistant's reply (and any
 * tool calls/results) into `history` as it goes. If the model calls tools, executes
 * them and loops until it produces a final text reply.
 */
async function streamTurn(
  client: OpenAI,
  model: string,
  history: ChatCompletionMessageParam[],
  toolDefs: ChatCompletionTool[] | undefined,
  toolsByName: Map<string, Tool>
): Promise<AsyncIterable<{ text: string }>> {
  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const stream = await client.chat.completions.create({
          model,
          messages: history,
          stream: true,
          ...(toolDefs ? { tools: toolDefs } : {}),
        });

        let assistantReply = "";
        const calls = new Map<number, { id: string; name: string; args: string }>();

        for await (const part of stream) {
          const delta = part.choices[0]?.delta;
          const text = delta?.content ?? "";
          if (text) {
            assistantReply += text;
            yield { text };
          }
          for (const toolCall of delta?.tool_calls ?? []) {
            const entry = calls.get(toolCall.index) ?? { id: "", name: "", args: "" };
            if (toolCall.id) entry.id = toolCall.id;
            if (toolCall.function?.name) entry.name += toolCall.function.name;
            if (toolCall.function?.arguments) entry.args += toolCall.function.arguments;
            calls.set(toolCall.index, entry);
          }
        }

        if (calls.size === 0) {
          history.push({ role: "assistant", content: assistantReply });
          return;
        }

        const orderedCalls = [...calls.values()];
        history.push({
          role: "assistant",
          content: assistantReply || null,
          tool_calls: orderedCalls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: c.args },
          })),
        });

        for (const call of orderedCalls) {
          const tool = toolsByName.get(call.name);
          const args = parseArgs(call.args);
          const result = tool ? await tool.execute(args) : `Unknown tool "${call.name}".`;
          history.push({ role: "tool", tool_call_id: call.id, content: result });
        }
      }
    },
  };
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
