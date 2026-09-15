import type { ContextProvider } from "../context/types.js";

export interface Persona {
  id: string;
  title: string;
  context: string;
  dynamicProviders: ContextProvider[];
}
