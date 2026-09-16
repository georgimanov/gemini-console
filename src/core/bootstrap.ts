import * as path from "node:path";
import { loadPersonas, type Persona } from "../domain/personas/index.js";
import { loadProfile } from "../domain/profile/index.js";
import { createTools } from "../domain/tools/registry.js";
import type { PersonaState } from "../domain/tools/registry.js";
import type { Tool } from "../domain/tools/types.js";

export interface CoreContext {
  resourcesDir: string;
  reportsDir: string;
  userId: string;
  personas: Map<string, Persona>;
  /** Builds the tool set for one session, scoped to its own mutable PersonaState. */
  makeTools: (personaState: PersonaState) => Tool[];
}

/** Loads personas/profile from Postgres for the given user and returns the shared context both interfaces bootstrap from. */
export async function loadCore(userId: string): Promise<CoreContext> {
  const resourcesDir = path.join(import.meta.dirname, "..", "..", "resources");
  const reportsDir = path.join(import.meta.dirname, "..", "..", "reports");

  const personas = await loadPersonas(userId);
  const profile = await loadProfile(userId);

  return {
    resourcesDir,
    reportsDir,
    userId,
    personas,
    makeTools: (personaState) => createTools(profile, userId, personaState),
  };
}
