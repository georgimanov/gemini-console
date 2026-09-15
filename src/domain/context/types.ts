/** A source of system-instruction text, resolved at a time appropriate to its freshness. */
export interface ContextProvider {
  id: string;
  load(): Promise<string>;
}
