import * as path from "node:path";
import { loadPersonas, type Persona } from "../domain/personas/index.js";
import { loadProfile } from "../domain/profile/index.js";
import { createTools } from "../domain/tools/registry.js";
import type { PersonaState } from "../domain/tools/registry.js";
import type { Tool } from "../domain/tools/types.js";
import { getPool } from "./db.js";
import { resolveOwnerUserId } from "./owner.js";

export interface CoreContext {
  resourcesDir: string;
  reportsDir: string;
  personas: Map<string, Persona>;
  /** Builds the tool set for one session, scoped to its own mutable PersonaState. */
  makeTools: (personaState: PersonaState) => Tool[];
}

/** Loads personas/profile from Postgres and returns the shared context both interfaces bootstrap from. */
export async function loadCore(): Promise<CoreContext> {
  const resourcesDir = path.join(import.meta.dirname, "..", "..", "resources");
  const reportsDir = path.join(import.meta.dirname, "..", "..", "reports");

  const userId = await resolveOwnerUserId(getPool());

  const personas = await loadPersonas(userId, resourcesDir);
  const profile = await loadProfile(userId);

  return {
    resourcesDir,
    reportsDir,
    personas,
    makeTools: (personaState) => createTools(profile, userId, personaState),
  };
}
