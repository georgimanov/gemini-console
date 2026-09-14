import type { ChatChunk } from "../llm/index.js";

export interface OutputMeta {
  provider: string;
  personaTitle: string;
  personaId: string | null;
}

export interface OutputSink {
  handle(stream: AsyncIterable<ChatChunk>, meta: OutputMeta): Promise<void>;
}
