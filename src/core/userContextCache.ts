import { loadCore, type CoreContext } from "./bootstrap.js";

/**
 * Personas/profile are per-user and rarely change within a process's lifetime, so this caches
 * each user's CoreContext after first load instead of re-querying Postgres on every request.
 */
const cache = new Map<string, Promise<CoreContext>>();

export function getUserContext(userId: string): Promise<CoreContext> {
  let context = cache.get(userId);
  if (!context) {
    context = loadCore(userId);
    cache.set(userId, context);
    context.catch(() => cache.delete(userId));
  }
  return context;
}
