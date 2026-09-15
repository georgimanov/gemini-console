import type { AthleteProfile } from "../profile.js";
import { createActivitiesTool } from "./activitiesTool.js";
import { createProfileTool } from "./profileTool.js";
import { createSleepTool } from "./sleepTool.js";
import type { Tool } from "./types.js";
import { createWeatherTool } from "./weatherTool.js";

/**
 * The tools available to every persona. The model decides per-turn whether it needs
 * sleep, activities, weather, or profile data rather than having it all injected into
 * the system instruction up front.
 */
export function createTools(profile: AthleteProfile, garminDataDir: string): Tool[] {
  return [
    createSleepTool(garminDataDir),
    createActivitiesTool(garminDataDir),
    createWeatherTool(profile),
    createProfileTool(profile),
  ];
}
