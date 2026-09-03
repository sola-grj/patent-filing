import "server-only";

type TimingFields = Partial<Record<
  "auth_ms" | "db_ms" | "storage_ms" | "email_ms" | "erp_ms" | "patent_service_ms",
  number
>>;

let invocationStartedAt = Date.now();

export async function measureServerOperation<T>(
  route: string,
  operation: () => Promise<T>,
  fields: TimingFields = {},
): Promise<T> {
  const startedAt = performance.now();
  let success = false;
  try {
    const result = await operation();
    success = true;
    return result;
  } finally {
    const totalMs = performance.now() - startedAt;
    console.info(JSON.stringify({
      event: "server_performance",
      route,
      success,
      cold_start: Date.now() - invocationStartedAt < 5_000,
      total_ms: roundMs(totalMs),
      ...Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, roundMs(value ?? 0)]),
      ),
    }));
    invocationStartedAt = 0;
  }
}

export async function measureStep<T>(operation: () => Promise<T>) {
  const startedAt = performance.now();
  const result = await operation();
  return { result, durationMs: roundMs(performance.now() - startedAt) };
}

export function toServerTiming(fields: TimingFields & { total_ms?: number }) {
  return Object.entries(fields)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(([name, duration]) => `${name.replace(/_ms$/, "")};dur=${roundMs(duration)}`)
    .join(", ");
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}
