import { Defaults } from "../../core/defaults.js";
import type { Tool } from "../../domain/tools/types.js";
import type { ChatHistoryTurn, ChatSession, LlmProvider, ProviderName } from "./types.js";
import { createGeminiProvider } from "./gemini.js";
import { createOpenAiProvider } from "./openai.js";
import { createOllamaProvider } from "./ollama.js";

export type { ChatChunk, ChatHistoryTurn, ChatSession, LlmProvider, ProviderName } from "./types.js";
export { withRetry } from "./retry.js";

const PROVIDER_FACTORIES: Record<ProviderName, () => LlmProvider> = {
  gemini: createGeminiProvider,
  openai: createOpenAiProvider,
  ollama: createOllamaProvider,
};

function resolveProviderName(): ProviderName {
  const raw = (process.env.LLM_PROVIDER ?? Defaults.PROVIDER).toLowerCase();
  if (raw in PROVIDER_FACTORIES) return raw as ProviderName;

  throw new Error(
    `Unknown LLM_PROVIDER "${raw}". Supported: ${Object.keys(PROVIDER_FACTORIES).join(", ")}.`
  );
}

/** The active provider name, selected once at startup via the LLM_PROVIDER env var (default "gemini"). */
export const activeProviderName: ProviderName = resolveProviderName();

/** The active provider, selected once at startup via the LLM_PROVIDER env var (default "gemini"). */
export const activeProvider: LlmProvider = PROVIDER_FACTORIES[activeProviderName]();

/**
 * Creates a new chat session on the active provider, optionally scoped to a persona's system
 * instruction and tools, and optionally resumed from a prior plain-text conversation.
 */
export function createChatSession(
  systemInstruction?: string,
  tools?: Tool[],
  history?: ChatHistoryTurn[]
): ChatSession {
  return activeProvider.createChatSession(systemInstruction, tools, history);
}
