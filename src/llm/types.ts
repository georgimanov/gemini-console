import type { Tool } from "../tools/types.js";

/** One streamed piece of a model's reply. */
export interface ChatChunk {
  text: string;
}

/** A stateful conversation with a model, scoped to one persona/system instruction. */
export interface ChatSession {
  sendMessageStream(message: string): Promise<AsyncIterable<ChatChunk>>;
}

/** A backend capable of starting chat sessions (Gemini, OpenAI, local...). */
export interface LlmProvider {
  createChatSession(systemInstruction?: string, tools?: Tool[]): ChatSession;
}

export type ProviderName = "gemini" | "openai" | "ollama";
