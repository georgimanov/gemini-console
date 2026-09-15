import { textOf } from "../xml.js";

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
