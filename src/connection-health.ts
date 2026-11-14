export const SNAPSHOT_TIMEOUT_MS = 25_000;
const STALE_AFTER_MS = 45_000;
const FAILURE_LIMIT = 3;

export class ConnectionHealth {
  private responseAt: number | null = null;
  private advancedAt: number | null = null;
  private cachedAt: number | null = null;
  private simulationTime: number | null = null;
  private failures = 0;

  accepted(simulationTime: number, now: number) {
    this.responseAt = now;
    this.failures = 0;
    if (this.simulationTime === null || simulationTime > this.simulationTime) {
      this.simulationTime = simulationTime;
      this.advancedAt = now;
    }
  }

  cached(capturedAt: number | null) {
    this.cachedAt = capturedAt !== null && Number.isFinite(capturedAt) ? capturedAt : null;
  }

  failed() { this.failures++; }

  view(now: number, online = true) {
    const responseAge = this.responseAt === null ? null : Math.max(0, now - this.responseAt);
    const advanceAge = this.advancedAt === null ? null : Math.max(0, now - this.advancedAt);
    const cacheAge = this.cachedAt === null ? null : Math.max(0, now - this.cachedAt);
    const stale = (responseAge !== null && responseAge >= STALE_AFTER_MS) || (advanceAge !== null && advanceAge >= STALE_AFTER_MS);
    const reason = !online || this.failures >= FAILURE_LIMIT ? 'offline'
      : stale ? 'stale'
      : this.failures > 0 && this.responseAt !== null ? 'delayed'
      : this.responseAt === null ? 'connecting' : 'live';
    const state = reason === 'offline' || reason === 'stale' ? 'offline'
      : reason === 'live' ? 'authoritative' : 'connecting';
    const age = (value: number | null) => value === null ? 'not received' : `${Math.floor(value / 1000)}s ago`;
    const detail = this.responseAt === null
      ? `No live response yet. Cached snapshot: ${cacheAge === null ? 'age unknown' : age(cacheAge)}.`
      : `Last live response ${age(responseAge)}. Last observed simulation advance ${age(advanceAge)}. Authoritative simulation time: ${this.simulationTime!.toFixed(2)}s.`;
    return { state, reason, failures: this.failures, simulationTime: this.simulationTime, responseAgeMs: responseAge, advanceAgeMs: advanceAge,
      detail: `${detail} Consecutive sync failures: ${this.failures}.${online ? '' : ' Browser reports no network connection.'}` } as const;
  }
}

type SnapshotRequest<T> = {
  read: (response: Response) => Promise<T>;
  usable: (payload: T) => boolean;
  fetcher?: typeof fetch;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> | number;
  cancel?: (timer: ReturnType<typeof setTimeout> | number) => void;
};

/** The deadline includes headers, body download and decoding; polling owns the retry. */
export async function requestCitySnapshot<T>(url: string, options: SnapshotRequest<T>): Promise<T> {
  const controller = new AbortController();
  const timer = (options.schedule ?? setTimeout)(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await options.read(response);
    if (!options.usable(payload)) throw new Error('invalid or empty civilization snapshot');
    return payload;
  } finally {
    (options.cancel ?? clearTimeout)(timer);
  }
}
