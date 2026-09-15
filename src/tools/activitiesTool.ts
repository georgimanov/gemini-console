import { readWorkoutsRange } from "../garmin/localStore.js";
import { lastNDates, resolveDaysArg } from "./dateRange.js";
import type { Tool } from "./types.js";

function minutes(seconds: number | null): string {
  return seconds === null ? "?" : `${Math.round(seconds / 60)}min`;
}

function km(meters: number | null): string {
  return meters === null ? "?" : `${(meters / 1000).toFixed(1)}km`;
}

/** Exposes synced Garmin activities (runs, rides, ...) as a callable tool. */
export function createActivitiesTool(dataDir: string): Tool {
  return {
    name: "get_activities",
    description:
      "Returns the athlete's recent workouts/activities synced from Garmin: type, duration, distance, " +
      "heart rate, training effect, and training load. Call this when reasoning about training history, " +
      "load, or progress toward a goal.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "How many of the most recent days to include (default 7, max 30).",
        },
      },
    },
    async execute(args) {
      const dates = lastNDates(resolveDaysArg(args)).sort();
      const records = await readWorkoutsRange(dataDir, dates);
      const activities = records.flatMap((r) => Object.values(r.activities));
      if (activities.length === 0) return "No activities have been synced for the requested period.";

      activities.sort((a, b) => a.startTime.localeCompare(b.startTime));

      const lines = activities.map((a) => {
        const parts = [a.activityType, minutes(a.durationSeconds), km(a.distanceM)];
        if (a.averageHr) parts.push(`avg HR ${a.averageHr}`);
        if (a.trainingEffectLabel) parts.push(a.trainingEffectLabel);
        if (a.activityTrainingLoad) parts.push(`load ${Math.round(a.activityTrainingLoad)}`);
        const name = a.activityName ? ` "${a.activityName}"` : "";
        return `${a.date}${name}: ${parts.join(", ")}`;
      });

      return lines.join("\n");
    },
  };
}
