import { readMetricsRange } from "../../integrations/garmin/localStore.js";
import { syncGarmin } from "../../integrations/garmin/sync.js";
import { lastNDates, resolveDaysArg } from "./dateRange.js";
import type { Tool } from "./types.js";

function hms(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Exposes synced Garmin sleep + overnight recovery metrics (score, stages, HRV, resting HR) as a callable tool. */
export function createSleepTool(userId: string): Tool {
  return {
    name: "get_sleep_data",
    description:
      "Returns the athlete's recent sleep and overnight recovery metrics synced from Garmin: sleep score, " +
      "total/deep/light/REM/awake duration, HRV, resting heart rate, respiration, and SpO2. " +
      "Call this when reasoning about sleep quality, recovery, or whether training should be adjusted.",
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
      const days = resolveDaysArg(args);
      const dates = lastNDates(days).sort();

      // syncGarmin skips the network round-trip on its own when today's sleep is
      // already stored, so this is cheap except on the one call per day that needs it.
      let syncWarning: string | null = null;
      try {
        await syncGarmin({ days, userId });
      } catch (error) {
        syncWarning = error instanceof Error ? error.message : String(error);
      }

      const [sleep, recovery] = await Promise.all([
        readMetricsRange(userId, "sleep", dates),
        readMetricsRange(userId, "recovery", dates),
      ]);

      const recoveryByDate = new Map(recovery.map((r) => [r.date, r.metrics]));
      if (sleep.length === 0) {
        return syncWarning
          ? `No sleep data has been synced for the requested period (sync attempt failed: ${syncWarning}).`
          : "No sleep data has been synced for the requested period.";
      }

      const lines = sleep.map((record) => {
        const m = record.metrics;
        const r = recoveryByDate.get(record.date) ?? {};
        const parts: string[] = [];
        if (m.sleep_score) parts.push(`score ${m.sleep_score.value}/100`);
        if (m.sleep_duration) parts.push(`duration ${hms(m.sleep_duration.value)}`);
        if (m.deep_sleep) parts.push(`deep ${hms(m.deep_sleep.value)}`);
        if (m.rem_sleep) parts.push(`REM ${hms(m.rem_sleep.value)}`);
        if (m.light_sleep) parts.push(`light ${hms(m.light_sleep.value)}`);
        if (m.awake_time) parts.push(`awake ${hms(m.awake_time.value)}`);
        if (r.hrv) parts.push(`HRV ${r.hrv.value}ms`);
        if (r.resting_hr) parts.push(`resting HR ${r.resting_hr.value}bpm`);
        if (r.avg_spo2) parts.push(`SpO2 ${r.avg_spo2.value}%`);
        return `${record.date}: ${parts.join(", ")}`;
      });

      return lines.join("\n") + (syncWarning ? `\n\n(Could not refresh today's data: ${syncWarning})` : "");
    },
  };
}
