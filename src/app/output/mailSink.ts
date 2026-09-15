import { sendMail } from "../mail/send.js";
import type { OutputSink } from "./types.js";

/** Buffers the full reply (no token-by-token printing) and emails it as markdown to `to`. */
export function createMailSink(to: string): OutputSink {
  return {
    async handle(stream, meta) {
      let full = "";
      for await (const chunk of stream) {
        full += chunk.text ?? "";
      }

      const subject = `${meta.personaTitle} report — ${new Date().toLocaleDateString()}`;
      try {
        const result = await sendMail({ to, subject, body: full, format: "markdown" });
        console.log(`\n✓ Emailed to ${to} (message ${result.messageId})\n`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.log(`\n✗ Email failed: ${reason}\n`);
      }
    },
  };
}
