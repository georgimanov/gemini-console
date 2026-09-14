import type { LlmProvider } from "./types.js";

/**
 * Not implemented yet — local models via Ollama expose an OpenAI-compatible endpoint
 * (http://localhost:11434/v1), so this can likely reuse createOpenAiProvider's shape
 * pointed at a custom baseURL instead of a fresh implementation.
 */
export function createOllamaProvider(): LlmProvider {
  throw new Error(
    "Local (Ollama) provider is not implemented yet. See src/llm/ollama.ts for notes."
  );
}
