// Thin fetch wrapper shared by the three panels: unwraps the JSON body and
// turns a non-2xx into an Error carrying the backend's Italian message
// (the API always answers { error: "..." } on failure).

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* body non-JSON: keep the status-code message */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

export interface LatencyConfig {
  enabled: boolean;
  minMs: number;
  maxMs: number;
}

export interface ChaosConfig {
  apiLatency: LatencyConfig;
  dbLatency: LatencyConfig;
  errorRate: number;
}

export interface RouteSummary {
  method: string;
  path: string;
  count: number;
  avg_ms: string;
  p50_ms: string;
  p95_ms: string;
  p99_ms: string;
  avg_db_ms: string;
  errors: number;
}
