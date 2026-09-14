import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseStringPromise } from "xml2js";
import { createFileContextProvider } from "./context/fileContextProvider.js";
import { createWeatherContextProvider } from "./context/weatherContextProvider.js";
import type { ContextProvider } from "./context/types.js";
import { loadProfile, type AthleteProfile } from "./profile.js";

export interface Persona {
  id: string;
  title: string;
  context: string;
  dynamicProviders: ContextProvider[];
}

/** Registry of <dynamicContext type="..."/> handlers, mirroring PROVIDER_FACTORIES in src/llm/index.ts. */
const DYNAMIC_CONTEXT_FACTORIES: Record<string, (profile: AthleteProfile) => ContextProvider> = {
  weather: createWeatherContextProvider,
};

/**
 * Canonical persona schema (enforced by buildPersonaContext):
 *   <persona id="matches-filename" title="Display Title">
 *     <identity>            optional, statement + roles only
 *       <statement>...</statement>
 *       <roles><role>...</role></roles>
 *     </identity>
 *     <mission>...</mission>   optional, plain text
 *     ... any other top-level sections ...
 *   </persona>
 *
 * Everything outside <identity>/<mission> is rendered generically (tag names
 * humanized, attributes and text preserved) so a persona file can declare
 * whatever structure it needs without the parser silently dropping it.
 */

/**
 * Loads every persona XML file in resources/personas into a map keyed by persona id,
 * merging in the content of each persona's <referencedDocuments> (resolved relative
 * to resourcesDir) so the model has the actual data, not just filenames.
 */
export async function loadPersonas(
  resourcesDir: string
): Promise<Map<string, Persona>> {
  const personas = new Map<string, Persona>();
  const personasDir = path.join(resourcesDir, "personas");
  const profile = await loadProfile(resourcesDir);

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

    const dynamicProviders = parseDynamicContext(persona, file, profile);

    personas.set(id, { id, title, context: fullContext, dynamicProviders });
  }

  return personas;
}

/** Parses zero or more <dynamicContext type="..."/> tags into ContextProviders via the registry above. */
function parseDynamicContext(persona: any, file: string, profile: AthleteProfile): ContextProvider[] {
  const entries: any[] = persona.dynamicContext ?? [];

  return entries.map((entry) => {
    const type: string | undefined = entry?.$?.type;
    if (!type) {
      throw new Error(`<dynamicContext> in "${file}" is missing a required "type" attribute.`);
    }

    const factory = DYNAMIC_CONTEXT_FACTORIES[type];
    if (!factory) {
      throw new Error(
        `Unknown dynamicContext type "${type}" in "${file}". Supported: ${Object.keys(DYNAMIC_CONTEXT_FACTORIES).join(", ")}.`
      );
    }

    return factory(profile);
  });
}

/**
 * A persona's full system instruction: static context, a fresh temporal context line,
 * and any dynamic providers (e.g. weather) resolved fresh. Call this at chat-session
 * creation, not once at load time, so time and dynamic context don't go stale over a
 * long-running process.
 */
export async function buildSystemInstruction(persona: Persona): Promise<string> {
  const dynamicSections = await Promise.all(persona.dynamicProviders.map((p) => p.load()));
  return [persona.context, buildTemporalContext(), ...dynamicSections.filter(Boolean)].join("\n\n");
}

/** Flattens a parsed persona XML object into plain text for use as a system instruction. */
export function buildPersonaContext(persona: any, title: string): string {
  const lines: string[] = [`Role: ${title}`];

  const identity = persona.identity?.[0];
  if (identity?.statement?.[0]) {
    lines.push(`Identity: ${textOf(identity.statement[0])}`);
  }
  if (identity?.roles?.[0]?.role) {
    lines.push(`Roles: ${identity.roles[0].role.map(textOf).join(", ")}`);
  }

  if (persona.mission?.[0]) {
    lines.push(`Mission: ${textOf(persona.mission[0])}`);
  }

  const handled = new Set(["$", "identity", "mission", "dynamicContext"]);
  for (const [key, value] of Object.entries(persona)) {
    if (handled.has(key)) continue;
    lines.push("");
    flatten(value, humanize(key), 0, lines);
  }

  return lines.join("\n");
}

/** Extracts the text content of an xml2js node, whether it parsed as a bare string or {_, $}. */
function textOf(node: any): string {
  const text = typeof node === "string" ? node : node?._ ?? "";
  return String(text).trim();
}

/** Converts a camelCase, PascalCase, or snake_case tag name into "Title Case Words". */
function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Recursively renders an xml2js-parsed node (string | {_, $, ...children} | array)
 * as indented, human-readable text, preserving attributes and text content
 * regardless of the tag names used.
 */
function flatten(node: any, label: string, depth: number, lines: string[]): void {
  const indent = "  ".repeat(depth);

  if (Array.isArray(node)) {
    for (const item of node) flatten(item, label, depth, lines);
    return;
  }

  if (typeof node === "string") {
    lines.push(`${indent}${label}: ${node.trim()}`);
    return;
  }

  if (node && typeof node === "object") {
    const { $: attrs, _: text, ...children } = node;
    const attrsStr = attrs
      ? Object.entries(attrs)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")
      : "";
    const heading = `${label}${attrsStr ? ` (${attrsStr})` : ""}`;
    const childKeys = Object.keys(children);

    if (childKeys.length === 0) {
      lines.push(`${indent}${heading}${text ? `: ${String(text).trim()}` : ""}`);
      return;
    }

    lines.push(`${indent}${heading}:`);
    if (text && String(text).trim()) {
      lines.push(`${indent}  ${String(text).trim()}`);
    }
    for (const childKey of childKeys) {
      flatten(children[childKey], humanize(childKey), depth + 1, lines);
    }
  }
}

/**
 * Renders the current date/time as a short line of context, so the model knows
 * "now" without it being baked into a persona's system instruction at
 * session-start and going stale over a long chat. Uses TZ (if set) or the
 * host's local timezone.
 */
export function buildTemporalContext(now: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);

  return `Current date/time: ${formatted}`;
}
