import { stdout } from "node:process";
import type { OutputSink } from "./types.js";

/** Streams the model's reply to the console token-by-token, as the REPL always has. */
export const streamToConsole: OutputSink = {
  async handle(stream, meta) {
    stdout.write(`${meta.provider}:${meta.personaTitle} > `);
    for await (const chunk of stream) {
      stdout.write(chunk.text ?? "");
    }
    stdout.write("\n\n");
  },
};
