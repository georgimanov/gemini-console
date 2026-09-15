import type { AthleteProfile } from "../profile/index.js";
import type { Tool } from "./types.js";

/** Exposes the athlete's static profile (resources/profile.xml) as a callable tool. */
export function createProfileTool(profile: AthleteProfile): Tool {
  return {
    name: "get_athlete_profile",
    description:
      "Returns static profile information about the athlete (e.g. home location). Call this when you need " +
      "background about the athlete rather than their day-to-day metrics.",
    parameters: { type: "object", properties: {} },
    async execute() {
      const lines: string[] = [];
      if (profile.location) lines.push(`Location: ${profile.location}`);
      return lines.length > 0 ? lines.join("\n") : "No profile information is available.";
    },
  };
}
