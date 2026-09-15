import type { ProviderName } from "../integrations/llm/types.js";

/** Centralized default values — no other file should hardcode a fallback inline. */
export class Defaults {
  static readonly PROVIDER: ProviderName = "gemini";
  static readonly PERSONA_ID = "andre";

  static readonly MODEL: Record<ProviderName, string> = {
    gemini: "gemini-3.5-flash-lite",
    openai: "gpt-4.1-mini",
    ollama: "llama3",
  };

  static readonly RETRY = {
    MAX_ATTEMPTS: 3,
    BASE_DELAY_MS: 500,
    RETRYABLE_STATUS_CODES: new Set([429, 503]),
  } as const;
}
