// Data access for todos. Every function optionally sleeps *before* running
// the real query, to simulate a slow query, and reports back how long it
// took (delay + real execution time) so the caller can attach it to the
// request metrics row. The artificial delay is deliberately kept separate
// from the real DB round-trip so both are visible in the metrics.

const { getConfig } = require("./config");
const { resolveDelay, sleep } = require("./simulate");

async function withSimulatedDb(pool, overrideMs, run) {
  const delay = resolveDelay(getConfig().dbLatency, overrideMs);
  if (delay > 0) await sleep(delay);

  const start = process.hrtime.bigint();
  const result = await run();
  const execMs = Number(process.hrtime.bigint() - start) / 1e6;

  return { result, dbDurationMs: delay + execMs, simulatedDelayMs: delay };
}

async function listTodos(pool, { dbDelayOverride } = {}) {
  return withSimulatedDb(pool, dbDelayOverride, async () => {
    const { rows } = await pool.query("SELECT * FROM todos ORDER BY id DESC");
    return rows;
  });
}

async function getTodo(pool, id, { dbDelayOverride } = {}) {
  return withSimulatedDb(pool, dbDelayOverride, async () => {
    const { rows } = await pool.query("SELECT * FROM todos WHERE id = $1", [id]);
    return rows[0] || null;
  });
}

async function createTodo(pool, title, { dbDelayOverride } = {}) {
  return withSimulatedDb(pool, dbDelayOverride, async () => {
    const { rows } = await pool.query(
      "INSERT INTO todos (title) VALUES ($1) RETURNING *",
      [title]
    );
    return rows[0];
  });
}

async function updateTodo(pool, id, fields, { dbDelayOverride } = {}) {
  return withSimulatedDb(pool, dbDelayOverride, async () => {
    const sets = [];
    const values = [];
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
      const { rows } = await pool.query("SELECT * FROM todos WHERE id = $1", [id]);
      return rows[0] || null;
    }
    sets.push("updated_at = now()");
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE todos SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    return rows[0] || null;
  });
}

async function deleteTodo(pool, id, { dbDelayOverride } = {}) {
  return withSimulatedDb(pool, dbDelayOverride, async () => {
    const { rowCount } = await pool.query("DELETE FROM todos WHERE id = $1", [id]);
    return rowCount > 0;
  });
}

module.exports = { listTodos, getTodo, createTodo, updateTodo, deleteTodo };
