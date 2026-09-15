import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { buildSystemInstruction, type Persona } from "../domain/personas/index.js";
import { createChatSession, withRetry, activeProviderName, type ChatSession } from "../integrations/llm/index.js";
import type { PersonaState } from "../domain/tools/registry.js";
import type { Tool } from "../domain/tools/types.js";
import { Defaults } from "./defaults.js";
import { buildUserMessage } from "./userMessage.js";
import { parseInput, type ParseContext } from "./input/index.js";
import { streamToConsole } from "./output/consoleSink.js";
import { createReportSink } from "./output/reportSink.js";
import { createMailSink } from "./output/mailSink.js";

/** Starts the interactive console loop: persona switching, chat streaming, /quit. */
export async function startRepl(
  personas: Map<string, Persona>,
  blocklist: Set<string>,
  reportsDir: string,
  tools: Tool[],
  personaState: PersonaState
): Promise<void> {
  if (personas.size === 0) {
    console.log(
      "No personas found. Add a persona XML file to resources/personas before starting the console."
    );
    throw new Error("No personas available.");
  }

  const defaultPersona = personas.get(Defaults.PERSONA_ID) ?? personas.values().next().value!;
  let currentPersona: Persona | null = defaultPersona;
  personaState.id = defaultPersona.id;
  let chat: ChatSession = createChatSession(buildSystemInstruction(defaultPersona), tools);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ctx: ParseContext = { personaIds: new Set(personas.keys()), blocklist };

  console.log("AI coach console — type a message, or /quit to exit. Type /help for commands.");
  console.log(`Available personas: ${Array.from(personas.keys()).join(", ")}`);
  console.log(`Default persona: ${currentPersona.title}`);
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
        currentPersona = personas.get(command.personaId)!;
        personaState.id = currentPersona.id;
        console.log(`\n✓ Loaded persona: ${currentPersona.title}\n`);
        chat = createChatSession(buildSystemInstruction(currentPersona), tools);
        rl.prompt();
        continue outer;
      }

      case "report":
      case "mail":
      case "message": {
        const text = command.type === "message" ? command.text : command.prompt;
        const userMessage = buildUserMessage(text, currentPersona);
        const sink =
          command.type === "report"
            ? createReportSink(reportsDir)
            : command.type === "mail"
              ? createMailSink(command.to)
              : streamToConsole;

        try {
          const stream = await withRetry(() => chat.sendMessageStream(userMessage));
          await sink.handle(stream, {
            provider: activeProviderName,
            personaTitle: currentPersona?.title ?? "no persona",
            personaId: currentPersona?.id ?? null,
          });
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
