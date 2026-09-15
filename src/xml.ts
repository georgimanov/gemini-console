/** Extracts the text content of an xml2js node, whether it parsed as a bare string or {_, $}. */
export function textOf(node: any): string {
  if (node === undefined) return "";
  const text = typeof node === "string" ? node : node?._ ?? "";
  return String(text).trim();
}
