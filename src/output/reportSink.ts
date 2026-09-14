import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { OutputSink } from "./types.js";

/** Buffers the full reply (no token-by-token printing) and saves it as markdown under reportsDir. */
export function createReportSink(reportsDir: string): OutputSink {
  return {
    async handle(stream, meta) {
      let full = "";
      for await (const chunk of stream) {
        full += chunk.text ?? "";
      }

      await fs.mkdir(reportsDir, { recursive: true });
      const filename = `${meta.personaId ?? "no-persona"}_${timestamp()}.md`;
      await fs.writeFile(path.join(reportsDir, filename), full, "utf-8");
      console.log(`\n✓ Report saved to reports/${filename}\n`);
    },
  };
}

/** Formats a Date as yyyyMMdd-HHmmss in local time, for use in a filename. */
function timestamp(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}`;
}
