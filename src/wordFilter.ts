import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Loads resources/blocklist.txt into a lowercase phrase set. Missing file -> empty set. */
export async function loadBlocklist(resourcesDir: string): Promise<Set<string>> {
  const blocklist = new Set<string>();

  let content: string;
  try {
    content = await fs.readFile(path.join(resourcesDir, "blocklist.txt"), "utf-8");
  } catch {
    return blocklist;
  }

  for (const line of content.split("\n")) {
    const phrase = line.trim().toLowerCase();
    if (!phrase || phrase.startsWith("#")) continue;
    blocklist.add(phrase);
  }

  return blocklist;
}

/** Whole-word/phrase, case-insensitive check of text against the blocklist. */
export function isOffensive(text: string, blocklist: Set<string>): boolean {
  const lower = text.toLowerCase();
  for (const phrase of blocklist) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`);
    if (pattern.test(lower)) return true;
  }
  return false;
}
