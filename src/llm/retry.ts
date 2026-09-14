const RETRYABLE_STATUS_CODES = new Set([429, 503]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return typeof status === "number" && RETRYABLE_STATUS_CODES.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `fn` with exponential backoff on transient errors (429/503, e.g. "high demand").
 * Rethrows immediately on non-retryable errors or once retries are exhausted.
 * Every provider SDK in use here (Google, OpenAI, Anthropic) surfaces a `.status`
 * field on its error class, so this works unchanged across providers.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES) {
        throw error;
      }
      await sleep(BASE_DELAY_MS * 2 ** attempt);
    }
  }

  throw lastError;
}
