import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseStringPromise } from "xml2js";

/** The athlete's profile, used to personalize dynamic context providers (e.g. weather). */
export interface AthleteProfile {
  location: string;
}

/** Loads resources/profile.xml. Missing file or missing <location> -> empty location. */
export async function loadProfile(resourcesDir: string): Promise<AthleteProfile> {
  const filePath = path.join(resourcesDir, "profile.xml");

  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    return { location: "" };
  }

  const parsed = await parseStringPromise(content);
  const location = textOf(parsed.profile?.location?.[0]);

  return { location };
}

/** Extracts the text content of an xml2js node, whether it parsed as a bare string or {_, $}. */
function textOf(node: any): string {
  if (node === undefined) return "";
  const text = typeof node === "string" ? node : node?._ ?? "";
  return String(text).trim();
}
