import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseStringPromise } from "xml2js";
import { createFileContextProvider } from "../context/fileContextProvider.js";
import { textOf } from "../../shared/xml.js";
import { buildPersonaContext } from "./render.js";
import type { Persona } from "./types.js";

/**
 * Loads every persona XML file in resources/personas into a map keyed by persona id,
 * merging in the content of each persona's <referencedDocuments> (resolved relative
 * to resourcesDir, may point at other files under resources/ including other personas)
 * so the model has the actual data, not just filenames.
 */
export async function loadPersonas(resourcesDir: string): Promise<Map<string, Persona>> {
  const personas = new Map<string, Persona>();
  const personasDir = path.join(resourcesDir, "personas");

  const files = await fs.readdir(personasDir);
  for (const file of files) {
    if (!file.endsWith(".xml")) continue;

    const filePath = path.join(personasDir, file);
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = await parseStringPromise(content);

    const persona = parsed.persona;
    const id: string | undefined = persona?.$?.id;
    const title: string | undefined = persona?.$?.title;
    const expectedId = path.basename(file, ".xml");

    if (!id) {
      throw new Error(
        `Persona file "${file}" is missing a required "id" attribute on <persona>.`
      );
    }
    if (!title) {
      throw new Error(
        `Persona file "${file}" is missing a required "title" attribute on <persona>.`
      );
    }
    if (id !== expectedId) {
      throw new Error(
        `Persona id "${id}" in "${file}" must match its filename ("${expectedId}").`
      );
    }

    const context = buildPersonaContext(persona, title);
    const referencedDocs: string[] = (persona.referencedDocuments?.[0]?.document ?? []).map(
      textOf
    );
    const fileProvider = createFileContextProvider(referencedDocs, resourcesDir);
    const referencedContext = await fileProvider.load();
    const fullContext = referencedContext
      ? `${context}\n\nReference Data:\n${referencedContext}`
      : context;

    personas.set(id, { id, title, context: fullContext });
  }

  return personas;
}
