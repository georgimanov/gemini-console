import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Chat } from "@google/genai";
import type { Persona } from "./personas.js";
import { createChatSession } from "./chat.js";

/** Starts the interactive console loop: persona switching, chat streaming, /quit. */
export async function startRepl(personas: Map<string, Persona>): Promise<void> {
  let currentPersona: Persona | null = null;
  let chat: Chat = createChatSession();

  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log("Gemini console dojo — type a message, or /quit to exit.");
  console.log(`Available personas: ${Array.from(personas.keys()).join(", ")}`);
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
        chat = createChatSession(persona.context);
      } else {
        console.log(
          `\n✗ Persona not found: ${personaName}. Available: ${Array.from(personas.keys()).join(", ")}\n`
        );
      }

      rl.prompt();
      continue;
    }

    const userMessage = currentPersona
      ? `[Using persona: ${currentPersona.title}] ${message}`
      : message;

    const stream = await chat.sendMessageStream({ message: userMessage });

    stdout.write("gemini> ");
    for await (const chunk of stream) {
      stdout.write(chunk.text ?? "");
    }
    stdout.write("\n\n");

    rl.prompt();
  }

  rl.close();
}
