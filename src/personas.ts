import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseStringPromise } from "xml2js";

export interface Persona {
  id: string;
  title: string;
  context: string;
}

/** Loads every persona XML file in resources/personas into a map keyed by persona id. */
export async function loadPersonas(
  personasDir: string
): Promise<Map<string, Persona>> {
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

/** Flattens a parsed persona XML object into plain text for use as a system instruction. */
export function buildPersonaContext(persona: any): string {
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
    lines.push(`Governing Law: ${persona.coreMission[0].governingLaw[0]}`);
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
