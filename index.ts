import { GoogleGenAI } from "@google/genai";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseStringPromise } from "xml2js";

const ai = new GoogleGenAI({});

interface Persona {
  id: string;
  title: string;
  context: string;
}

async function loadPersonas(): Promise<Map<string, Persona>> {
  const personasDir = path.join(
    import.meta.dirname,
    "resources",
    "personas"
  );
  const personas = new Map<string, Persona>();

  const files = await fs.readdir(personasDir);
  for (const file of files) {
    if (!file.endsWith(".xml")) continue;

    const filePath = path.join(personasDir, file);
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = await parseStringPromise(content);

    const persona = parsed.persona;
    const id = persona.$.id;
    const title = persona.title?.[0] || file;

    const context = buildPersonaContext(persona);
    personas.set(id, { id, title, context });
  }

  return personas;
}

function buildPersonaContext(persona: any): string {
  const lines: string[] = [];

  if (persona.title?.[0]) {
    lines.push(`Role: ${persona.title[0]}`);
  }

  if (persona.coreMission?.[0]?.primaryResponsibility?.[0]) {
    lines.push(
      `Primary Responsibility: ${persona.coreMission[0].primaryResponsibility[0]}`
    );
  }

  if (persona.coreMission?.[0]?.governingLaw?.[0]) {
    lines.push(
      `Governing Law: ${persona.coreMission[0].governingLaw[0]}`
    );
  }

  if (persona.identity?.[0]?.statement?.[0]) {
    lines.push(`Identity: ${persona.identity[0].statement[0]}`);
  }

  if (persona.orchestrationLogic?.[0]?.decisionRules?.[0]?.rule) {
    lines.push("Decision Rules:");
    persona.orchestrationLogic[0].decisionRules[0].rule.forEach(
      (rule: any, idx: number) => {
        lines.push(`  ${idx + 1}. ${rule._}`);
      }
    );
  }

  return lines.join("\n");
}

const personas = await loadPersonas();
let currentPersona: Persona | null = null;

let chat = ai.chats.create({
  model: "gemini-3.6-flash",
});

const rl = readline.createInterface({ input: stdin, output: stdout });

console.log("Gemini console dojo — type a message, or /quit to exit.");
console.log(
  `Available personas: ${Array.from(personas.keys()).join(", ")}`
);
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
      chat = ai.chats.create({
        model: "gemini-3.6-flash",
        systemInstruction: persona.context,
      });
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
