import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { buildSystemInstruction, type Persona } from "./personas.js";
import { createChatSession, withRetry, activeProviderName, type ChatSession } from "./llm/index.js";
import { Defaults } from "./defaults.js";
import { buildUserMessage } from "./userMessage.js";

/** Starts the interactive console loop: persona switching, chat streaming, /quit. */
export async function startRepl(personas: Map<string, Persona>): Promise<void> {
  if (personas.size === 0) {
    console.log(
      "No personas found. Add a persona XML file to resources/personas before starting the console."
    );
    throw new Error("No personas available.");
  }

  const defaultPersona = personas.get(Defaults.PERSONA_ID) ?? personas.values().next().value!;
  let currentPersona: Persona | null = defaultPersona;
  let chat: ChatSession = createChatSession(buildSystemInstruction(defaultPersona));

  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log("AI coach console — type a message, or /quit to exit.");
  console.log(`Available personas: ${Array.from(personas.keys()).join(", ")}`);
  console.log(`Default persona: ${currentPersona.title}`);
  console.log("Type @persona-name to load a persona.\n");

  rl.setPrompt("you> ");
  rl.prompt();

  for await (const message of rl) {
    const trimmed = message.trim();

    if (trimmed === "/quit") {
      break;
    }

    if (trimmed === "") {
      rl.prompt();
      continue;
    }

    if (trimmed.startsWith("@")) {
      const personaName = trimmed.slice(1).toLowerCase();
      const persona = personas.get(personaName);

      if (persona) {
        currentPersona = persona;
        console.log(`\n✓ Loaded persona: ${persona.title}\n`);
        chat = createChatSession(buildSystemInstruction(persona));
      } else {
        console.log(
          `\n✗ Persona not found: ${personaName}. Available: ${Array.from(personas.keys()).join(", ")}\n`
        );
      }

      rl.prompt();
      continue;
    }

    const userMessage = buildUserMessage(message, currentPersona);

    try {
      const stream = await withRetry(() => chat.sendMessageStream(userMessage));

      stdout.write(`${activeProviderName}:${currentPersona?.title ?? "no persona"} > `);
      for await (const chunk of stream) {
        stdout.write(chunk.text ?? "");
      }
      stdout.write("\n\n");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`\n✗ Request failed: ${reason}\n`);
    }

    rl.prompt();
  }

  rl.close();
}
