/**
 * Renders the current date/time as a short line of context, so the model knows
 * "now" without it being baked into a persona's system instruction at
 * session-start and going stale over a long chat. Uses TZ (if set) or the
 * host's local timezone.
 */
export function buildTemporalContext(now: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);

  return `Current date/time: ${formatted}`;
}
