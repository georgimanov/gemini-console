import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Persona } from "../../domain/personas/index.js";
import { switchPersona, sendMessage, type Session } from "../../core/session.js";
import { parseInput, type ParseContext } from "./input/index.js";
import { streamToConsole } from "./output/consoleSink.js";
import { createReportSink } from "./output/reportSink.js";
import { createMailSink } from "./output/mailSink.js";

/** Starts the interactive console loop over an already-created session: persona switching, chat streaming, /quit. */
export async function startRepl(
  session: Session,
  personas: Map<string, Persona>,
  blocklist: Set<string>,
  reportsDir: string
): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ctx: ParseContext = { personaIds: new Set(personas.keys()), blocklist };

  console.log("AI coach console — type a message, or /quit to exit. Type /help for commands.");
  console.log(`Available personas: ${Array.from(personas.keys()).join(", ")}`);
  console.log(`Default persona: ${session.currentPersona!.title}`);
  console.log("Type @persona-name to load a persona.\n");

  rl.setPrompt("you> ");
  rl.prompt();

  outer: for await (const line of rl) {
    const command = parseInput(line, ctx);

    switch (command.type) {
      case "empty":
        rl.prompt();
        continue outer;

      case "quit":
        break outer;

      case "help":
        console.log(
          `\nCommands: /quit, /help, /report <topic>, /mail <email> <topic>, @persona-name\nPersonas: ${Array.from(personas.keys()).join(", ")}\n`
        );
        rl.prompt();
        continue outer;

      case "rejected":
        console.log(`\n✗ ${command.reason}\n`);
        rl.prompt();
        continue outer;

      case "switchPersona": {
        switchPersona(session, command.personaId);
        console.log(`\n✓ Loaded persona: ${session.currentPersona!.title}\n`);
        rl.prompt();
        continue outer;
      }

      case "report":
      case "mail":
      case "message": {
        const text = command.type === "message" ? command.text : command.prompt;
        const sink =
          command.type === "report"
            ? createReportSink(reportsDir)
            : command.type === "mail"
              ? createMailSink(command.to)
              : streamToConsole;

        try {
          const { stream, meta } = await sendMessage(session, text);
          await sink.handle(stream, meta);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.log(`\n✗ Request failed: ${reason}\n`);
        }

        rl.prompt();
        continue outer;
      }
    }
  }

  rl.close();
}
