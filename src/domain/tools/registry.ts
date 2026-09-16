import type { AthleteProfile } from "../profile/index.js";
import { createActivitiesTool } from "./activitiesTool.js";
import {
  createGetSavedPlanTool,
  createSavePlanTool,
  createUpdatePlanTool,
  type PersonaState,
} from "./planStoreTool.js";
import { createProfileTool } from "./profileTool.js";
import { createSleepTool } from "./sleepTool.js";
import type { Tool } from "./types.js";
import { createWeatherTool } from "./weatherTool.js";

export type { PersonaState };

/**
 * The tools available to every persona. The model decides per-turn whether it needs
 * sleep, activities, weather, or profile data rather than having it all injected into
 * the system instruction up front. `persona` is a mutable holder the caller updates on
 * persona switch, so the plan-store tools scope to whichever persona is currently active.
 */
export function createTools(profile: AthleteProfile, userId: string, persona: PersonaState): Tool[] {
  return [
    createSleepTool(userId),
    createActivitiesTool(userId),
    createWeatherTool(profile),
    createProfileTool(profile),
    createGetSavedPlanTool(userId, persona),
    createSavePlanTool(userId, persona),
    createUpdatePlanTool(userId, persona),
  ];
}
