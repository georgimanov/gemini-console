import type { Tool } from "../../domain/tools/types.js";

/** One streamed piece of a model's reply. */
export interface ChatChunk {
  text: string;
}

/** One turn of prior plain-text conversation, used to resume a session started in an earlier process. */
export interface ChatHistoryTurn {
  role: "user" | "model";
  text: string;
}

/** A stateful conversation with a model, scoped to one persona/system instruction. */
export interface ChatSession {
  sendMessageStream(message: string): Promise<AsyncIterable<ChatChunk>>;
}

/** A backend capable of starting chat sessions (Gemini, OpenAI, local...). */
export interface LlmProvider {
  createChatSession(systemInstruction?: string, tools?: Tool[], history?: ChatHistoryTurn[]): ChatSession;
}

export type ProviderName = "gemini" | "openai" | "ollama";
