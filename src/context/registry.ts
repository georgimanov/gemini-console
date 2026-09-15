import type { AthleteProfile } from "../profile.js";
import type { ContextProvider } from "./types.js";
import { createWeatherContextProvider } from "./weatherContextProvider.js";

/**
 * Every dynamic context type a persona XML file can request via <dynamicContext type="...">.
 * To add a new one: write a createXContextProvider(profile) in this directory and register
 * it here — nothing outside src/context needs to change.
 */
const DYNAMIC_CONTEXT_FACTORIES: Record<string, (profile: AthleteProfile) => ContextProvider> = {
  weather: createWeatherContextProvider,
};

export const DYNAMIC_CONTEXT_TYPES: readonly string[] = Object.keys(DYNAMIC_CONTEXT_FACTORIES);

/** Resolves a <dynamicContext type="..."> value into a live ContextProvider, bound to profile. */
export function resolveDynamicContext(type: string, profile: AthleteProfile): ContextProvider {
  const factory = DYNAMIC_CONTEXT_FACTORIES[type];
  if (!factory) {
    throw new Error(`Unknown dynamicContext type "${type}". Supported: ${DYNAMIC_CONTEXT_TYPES.join(", ")}.`);
  }
  return factory(profile);
}
