import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Resolves a persona's <referencedDocuments> entries into their file contents.
 * Entries are paths relative to resourcesDir; a trailing "/*" expands to every
 * file currently in that directory. Entries that don't exist yet (most of
 * resources/data, todays-plan/, archives/, ...) are skipped silently rather
 * than failing, since personas are written ahead of the data existing.
 */
export async function loadReferencedContext(
  documentPaths: string[],
  resourcesDir: string
): Promise<string> {
  const files = await resolvePaths(documentPaths, resourcesDir);

  const sections: string[] = [];
  for (const relPath of files) {
    const content = await tryReadFile(path.join(resourcesDir, relPath));
    if (content !== null) {
      sections.push(`--- ${relPath} ---\n${content.trim()}`);
    }
  }

  return sections.join("\n\n");
}

/** Expands any "dir/*" entries against the filesystem; leaves literal paths untouched. */
async function resolvePaths(
  documentPaths: string[],
  resourcesDir: string
): Promise<string[]> {
  const resolved: string[] = [];

  for (const docPath of documentPaths) {
    if (!docPath.endsWith("/*")) {
      resolved.push(docPath);
      continue;
    }

    const dir = docPath.slice(0, -"/*".length);
    try {
      const entries = await fs.readdir(path.join(resourcesDir, dir), {
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (entry.isFile()) resolved.push(path.join(dir, entry.name));
      }
    } catch {
      // Directory doesn't exist yet.
    }
  }

  return resolved;
}

async function tryReadFile(absPath: string): Promise<string | null> {
  try {
    return await fs.readFile(absPath, "utf-8");
  } catch {
    return null;
  }
}
