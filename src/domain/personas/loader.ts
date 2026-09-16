import { getPool } from "../../core/db.js";
import { createDbContextProvider } from "../context/dbContextProvider.js";
import { buildPersonaContext } from "./render.js";
import type { Persona } from "./types.js";

/**
 * Loads every persona row for this user into a map keyed by persona id (slug), merging in
 * the content of each persona's referenced_documents (resolved via dbContextProvider,
 * which reads most of them from Postgres now — see migrateData.ts) so the model has the
 * actual data, not just filenames.
 */
export async function loadPersonas(userId: string, resourcesDir: string): Promise<Map<string, Persona>> {
  const personas = new Map<string, Persona>();

  const result = await getPool().query<{
    slug: string;
    title: string;
    definition: unknown;
    referenced_documents: string[];
  }>(
    "select slug, title, definition, referenced_documents from personas where user_id = $1 and is_active",
    [userId]
  );

  for (const row of result.rows) {
    const context = buildPersonaContext(row.definition, row.title);
    const provider = createDbContextProvider(userId, row.referenced_documents, resourcesDir);
    const referencedContext = await provider.load();
    const fullContext = referencedContext
      ? `${context}\n\nReference Data:\n${referencedContext}`
      : context;

    personas.set(row.slug, { id: row.slug, title: row.title, context: fullContext });
  }

  return personas;
}
