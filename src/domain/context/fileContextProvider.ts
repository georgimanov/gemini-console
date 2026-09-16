import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Reads one file under resourcesDir, relative path; null if missing. Used by
 * dbContextProvider.ts as a fallback for referencedDocuments entries that don't map to a
 * Postgres-backed resource (e.g. data/atlas-sprint-log.xml, which stayed file-based).
 */
export async function readResourceFile(resourcesDir: string, relPath: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(resourcesDir, relPath), "utf-8");
  } catch {
    return null;
  }
}
