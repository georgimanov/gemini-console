// Garmin sync: log in, pull the last N days, upsert into garmin_metrics/garmin_activities
// (Postgres) — see localStore.ts.
// garmin-connect is CJS with a getter-based named export, which Node's ESM
// interop can't statically detect — import the default and destructure instead.
import garminConnectPkg from "garmin-connect";
const { GarminConnect } = garminConnectPkg;
import { parseActivity, parseSleep, parseSteps, parseWeight } from "./parse.js";
import { hasSleepData, upsertActivity, upsertMetrics } from "./localStore.js";
import type { MetricRow } from "./types.js";

// Garmin has no "activities in date range" getter, only "N most recent" — so we
// over-fetch a generous page and then filter down to the `days` window below.
// If more than this many activities happened within the window, the oldest of
// them are silently dropped; raise this if that becomes a real account's reality.
const ACTIVITIES_FETCH_LIMIT = 50;

// Garmin sits behind Cloudflare, which returns HTTP 429 (error_1015) when we hit
// its per-IP rate limit. The body carries a `retry_after` (seconds) hint. We honor
// it when present, otherwise fall back to exponential backoff (base doubles each try).
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Detect a Cloudflare/Garmin rate-limit error and extract retry_after (ms) if present.
function rateLimitDelayMs(err: unknown): number | undefined {
  const text = err instanceof Error ? err.message : String(err);
  const isRateLimited =
    /\b429\b/.test(text) ||
    /too many requests/i.test(text) ||
    /error[_ ]?1015/i.test(text) ||
    /rate[_ -]?limit/i.test(text);
  if (!isRateLimited) return undefined;

  const match = text.match(/"retry_after"\s*:\s*(\d+)/);
  if (match) return Number(match[1]) * 1000;
  return -1; // rate-limited but no explicit hint — signal caller to use backoff
}

// Run fn, retrying only on rate-limit errors with backoff. Other errors propagate immediately.
async function withRateLimitRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const hint = rateLimitDelayMs(err);
      if (hint === undefined || attempt >= MAX_RETRIES) throw err;

      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      const delay = hint > 0 ? Math.max(hint, backoff) : backoff;
      console.warn(
        `${label}: rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${Math.round(delay / 1000)}s before retry`
      );
      await sleep(delay);
    }
  }
}

export interface SyncResult {
  days: number;
  syncedDates: string[];
  metricRowsWritten: number;
  activitiesWritten: number;
  warnings: string[];
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function lastNDates(n: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d);
  }
  return out;
}

// Run a getter, returning its result or undefined. Getters throw on missing data
// (e.g. no weight logged that day) — that is not a failure, just no rows.
async function tryGet<T>(
  label: string,
  warnings: string[],
  fn: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

export interface SyncOptions {
  days?: number;
  force?: boolean;
  /** Owner user to upsert garmin_metrics/garmin_activities rows for. */
  userId: string;
}

export async function syncGarmin({ days = 7, force = false, userId }: SyncOptions): Promise<SyncResult> {
  const username = process.env.GARMIN_USERNAME;
  const password = process.env.GARMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("GARMIN_USERNAME / GARMIN_PASSWORD are not set.");
  }

  const warnings: string[] = [];

  // Skip the whole sync (no Garmin login, no rate-limit risk) when today's sleep is
  // already stored. A manual re-sync passes force=true to bypass this.
  const today = ymd(new Date());
  if (!force && (await hasSleepData(userId, today))) {
    return {
      days,
      syncedDates: [],
      metricRowsWritten: 0,
      activitiesWritten: 0,
      warnings: [`Skipped: sleep data already present for ${today}. Use force to re-sync.`],
    };
  }

  const client = new GarminConnect({ username, password });

  // login() is the fragile step (rate limits / Cloudflare / MFA). Retry on 429 with
  // backoff; any other failure (or exhausted retries) throws to the caller.
  await withRateLimitRetry("login", () => client.login());

  const dates = lastNDates(days);
  const syncedDates: string[] = [];
  let metricRowsWritten = 0;

  for (const d of dates) {
    const dateStr = ymd(d);
    const rows: MetricRow[] = [];

    const sleepData = await tryGet(`sleep ${dateStr}`, warnings, () =>
      withRateLimitRetry(`sleep ${dateStr}`, () => client.getSleepData(d))
    );
    if (sleepData) rows.push(...parseSleep(sleepData, dateStr));

    const weight = await tryGet(`weight ${dateStr}`, warnings, () =>
      withRateLimitRetry(`weight ${dateStr}`, () => client.getDailyWeightData(d))
    );
    if (weight) rows.push(...parseWeight(weight, dateStr));

    const steps = await tryGet(`steps ${dateStr}`, warnings, () =>
      withRateLimitRetry(`steps ${dateStr}`, () => client.getSteps(d))
    );
    if (steps !== undefined) rows.push(...parseSteps(steps, dateStr));

    metricRowsWritten += await upsertMetrics(userId, rows);
    if (rows.length > 0) syncedDates.push(dateStr);
  }

  // Activities: default to the same `days` window as the wellness metrics above
  // (Garmin has no native date-range getter — see ACTIVITIES_FETCH_LIMIT note).
  let activitiesWritten = 0;
  const windowDates = new Set(dates.map(ymd));
  const list = await tryGet("activities", warnings, () =>
    withRateLimitRetry("activities", () => client.getActivities(0, ACTIVITIES_FETCH_LIMIT))
  );
  if (Array.isArray(list)) {
    for (const item of list) {
      const row = parseActivity(item);
      if (!row || !windowDates.has(row.date)) continue;
      await upsertActivity(userId, row);
      activitiesWritten += 1;
    }
  }

  return {
    days,
    syncedDates,
    metricRowsWritten,
    activitiesWritten,
    warnings,
  };
}
