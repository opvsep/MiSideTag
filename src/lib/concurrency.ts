export const MIN_MATCH_CONCURRENCY = 1;
export const MAX_MATCH_CONCURRENCY = 10;
export const DEFAULT_MATCH_CONCURRENCY = 3;

export function normalizeMatchingConcurrency(
  value: unknown,
  fallback = DEFAULT_MATCH_CONCURRENCY,
): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(
    MAX_MATCH_CONCURRENCY,
    Math.max(MIN_MATCH_CONCURRENCY, Math.round(numeric)),
  );
}

export async function runConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  if (!items.length) return;
  let nextIndex = 0;
  let failed = false;
  const workerCount = Math.min(
    items.length,
    normalizeMatchingConcurrency(concurrency),
  );

  const runners = Array.from({ length: workerCount }, async () => {
    while (!failed && !shouldStop()) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        await worker(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  await Promise.all(runners);
}
