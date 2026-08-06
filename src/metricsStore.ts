// Persists one row per /api/todos request and exposes aggregate queries used
// by the metrics-analysis function this app exists to exercise. Percentiles
// are computed by Postgres itself (percentile_cont) rather than in JS.

import type { Pool } from "pg";

export interface MetricEntry {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  dbDurationMs?: number;
  simulatedApiDelayMs?: number;
  simulatedDbDelayMs?: number;
  isError?: boolean;
}

export interface RouteSummary {
  method: string;
  path: string;
  count: number;
  avg_ms: string;
  min_ms: string;
  max_ms: string;
  p50_ms: string;
  p95_ms: string;
  p99_ms: string;
  avg_db_ms: string;
  errors: number;
}

export interface TimeseriesPoint {
  bucket: string;
  count: number;
  avg_ms: string;
  p95_ms: string;
  errors: number;
}

export interface RawMetricRow {
  id: string;
  ts: string;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  db_duration_ms: number;
  simulated_api_delay_ms: number;
  simulated_db_delay_ms: number;
  is_error: boolean;
}

export async function insertMetric(pool: Pool, entry: MetricEntry): Promise<void> {
  await pool.query(
    `INSERT INTO request_metrics
      (method, path, status_code, duration_ms, db_duration_ms,
       simulated_api_delay_ms, simulated_db_delay_ms, is_error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      entry.method,
      entry.path,
      entry.statusCode,
      entry.durationMs,
      entry.dbDurationMs || 0,
      entry.simulatedApiDelayMs || 0,
      entry.simulatedDbDelayMs || 0,
      !!entry.isError,
    ]
  );
}

export async function getSummary(pool: Pool, minutes: number): Promise<RouteSummary[]> {
  const { rows } = await pool.query<RouteSummary>(
    `SELECT
        method,
        path,
        count(*)::int AS count,
        round(avg(duration_ms)::numeric, 2) AS avg_ms,
        round(min(duration_ms)::numeric, 2) AS min_ms,
        round(max(duration_ms)::numeric, 2) AS max_ms,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)::numeric, 2) AS p50_ms,
        round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 2) AS p95_ms,
        round(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)::numeric, 2) AS p99_ms,
        round(avg(db_duration_ms)::numeric, 2) AS avg_db_ms,
        sum(CASE WHEN is_error THEN 1 ELSE 0 END)::int AS errors
     FROM request_metrics
     WHERE ts > now() - ($1 || ' minutes')::interval
     GROUP BY method, path
     ORDER BY count DESC`,
    [minutes]
  );
  return rows;
}

export async function getTimeseries(pool: Pool, minutes: number): Promise<TimeseriesPoint[]> {
  const { rows } = await pool.query<TimeseriesPoint>(
    `SELECT
        date_trunc('minute', ts) AS bucket,
        count(*)::int AS count,
        round(avg(duration_ms)::numeric, 2) AS avg_ms,
        round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 2) AS p95_ms,
        sum(CASE WHEN is_error THEN 1 ELSE 0 END)::int AS errors
     FROM request_metrics
     WHERE ts > now() - ($1 || ' minutes')::interval
     GROUP BY 1
     ORDER BY 1`,
    [minutes]
  );
  return rows;
}

export async function getRaw(pool: Pool, limit: number): Promise<RawMetricRow[]> {
  const { rows } = await pool.query<RawMetricRow>(
    `SELECT id, ts, method, path, status_code, duration_ms, db_duration_ms,
            simulated_api_delay_ms, simulated_db_delay_ms, is_error
     FROM request_metrics
     ORDER BY ts DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function resetMetrics(pool: Pool): Promise<void> {
  await pool.query("TRUNCATE TABLE request_metrics");
}
