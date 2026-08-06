// Data access for todos. Every function optionally sleeps *before* running
// the real query, to simulate a slow query, and reports back how long it
// took (delay + real execution time) so the caller can attach it to the
// request metrics row. The artificial delay is deliberately kept separate
// from the real DB round-trip so both are visible in the metrics.

import type { Pool } from "pg";
import { getConfig } from "./chaosConfig";
import { resolveDelay, sleep } from "./simulate";

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Timed<T> {
  result: T;
  dbDurationMs: number;
  simulatedDelayMs: number;
}

export interface RepoOptions {
  dbDelayOverride?: number;
}

async function withSimulatedDb<T>(overrideMs: number | undefined, run: () => Promise<T>): Promise<Timed<T>> {
  const delay = resolveDelay(getConfig().dbLatency, overrideMs);
  if (delay > 0) await sleep(delay);

  const start = process.hrtime.bigint();
  const result = await run();
  const execMs = Number(process.hrtime.bigint() - start) / 1e6;

  return { result, dbDurationMs: delay + execMs, simulatedDelayMs: delay };
}

export async function listTodos(pool: Pool, { dbDelayOverride }: RepoOptions = {}): Promise<Timed<Todo[]>> {
  return withSimulatedDb(dbDelayOverride, async () => {
    const { rows } = await pool.query<Todo>("SELECT * FROM todos ORDER BY id DESC");
    return rows;
  });
}

export async function getTodo(pool: Pool, id: string, { dbDelayOverride }: RepoOptions = {}): Promise<Timed<Todo | null>> {
  return withSimulatedDb(dbDelayOverride, async () => {
    const { rows } = await pool.query<Todo>("SELECT * FROM todos WHERE id = $1", [id]);
    return rows[0] ?? null;
  });
}

export async function createTodo(pool: Pool, title: string, { dbDelayOverride }: RepoOptions = {}): Promise<Timed<Todo>> {
  return withSimulatedDb(dbDelayOverride, async () => {
    const { rows } = await pool.query<Todo>("INSERT INTO todos (title) VALUES ($1) RETURNING *", [title]);
    return rows[0];
  });
}

export interface TodoFields {
  title?: string;
  completed?: boolean;
}

export async function updateTodo(
  pool: Pool,
  id: string,
  fields: TodoFields,
  { dbDelayOverride }: RepoOptions = {}
): Promise<Timed<Todo | null>> {
  return withSimulatedDb(dbDelayOverride, async () => {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (fields.title !== undefined) {
      sets.push(`title = $${i++}`);
      values.push(fields.title);
    }
    if (fields.completed !== undefined) {
      sets.push(`completed = $${i++}`);
      values.push(fields.completed);
    }
    if (sets.length === 0) {
      const { rows } = await pool.query<Todo>("SELECT * FROM todos WHERE id = $1", [id]);
      return rows[0] ?? null;
    }
    sets.push("updated_at = now()");
    values.push(id);

    const { rows } = await pool.query<Todo>(
      `UPDATE todos SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    return rows[0] ?? null;
  });
}

export async function deleteTodo(pool: Pool, id: string, { dbDelayOverride }: RepoOptions = {}): Promise<Timed<boolean>> {
  return withSimulatedDb(dbDelayOverride, async () => {
    const { rowCount } = await pool.query("DELETE FROM todos WHERE id = $1", [id]);
    return (rowCount ?? 0) > 0;
  });
}
