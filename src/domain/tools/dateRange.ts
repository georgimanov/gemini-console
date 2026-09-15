/** The last `n` calendar dates as "YYYY-MM-DD" strings, newest first, including today. */
export function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Clamps a model-supplied "days" arg to a sane range, defaulting when absent/invalid. */
export function resolveDaysArg(args: Record<string, unknown>, fallback = 7, max = 30): number {
  const raw = args.days;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), 1), max);
}
