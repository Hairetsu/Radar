export const MAX_BURST_COUNT = 50;
export const MAX_BURST_CONCURRENCY = 5;
export const MAX_BURST_DELAY_MS = 10_000;

function clamp(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), minimum), maximum);
}

export function normalizeBurstLimits(input: { count?: unknown; concurrency?: unknown; delayMs?: unknown }) {
  return {
    count: clamp(input.count, 1, 1, MAX_BURST_COUNT),
    concurrency: clamp(input.concurrency, 1, 1, MAX_BURST_CONCURRENCY),
    delayMs: clamp(input.delayMs, 0, 0, MAX_BURST_DELAY_MS)
  };
}
