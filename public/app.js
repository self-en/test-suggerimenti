const todoForm = document.getElementById("todo-form");
const todoTitle = document.getElementById("todo-title");
const todoList = document.getElementById("todo-list");
const todoStatus = document.getElementById("todo-status");

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function loadTodos() {
  todoStatus.textContent = "";
  try {
    const todos = await api("/api/todos");
    todoList.innerHTML = "";
    for (const t of todos) {
      const li = document.createElement("li");
      li.className = t.completed ? "completed" : "";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = t.completed;
      checkbox.addEventListener("change", () => toggleTodo(t.id, checkbox.checked));

      const span = document.createElement("span");
      span.textContent = t.title;

      const del = document.createElement("button");
      del.textContent = "Elimina";
      del.addEventListener("click", () => deleteTodo(t.id));

      li.append(checkbox, span, del);
      todoList.appendChild(li);
    }
  } catch (err) {
    todoStatus.textContent = `Errore nel caricamento: ${err.message}`;
  }
}

todoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = todoTitle.value.trim();
  if (!title) return;
  try {
    await api("/api/todos", { method: "POST", body: JSON.stringify({ title }) });
    todoTitle.value = "";
    await loadTodos();
  } catch (err) {
    todoStatus.textContent = `Errore: ${err.message}`;
  }
});

async function toggleTodo(id, completed) {
  try {
    await api(`/api/todos/${id}`, { method: "PATCH", body: JSON.stringify({ completed }) });
    await loadTodos();
  } catch (err) {
    todoStatus.textContent = `Errore: ${err.message}`;
  }
}

async function deleteTodo(id) {
  try {
    await api(`/api/todos/${id}`, { method: "DELETE" });
    await loadTodos();
  } catch (err) {
    todoStatus.textContent = `Errore: ${err.message}`;
  }
}

// --- Chaos config ---

const apiEnabled = document.getElementById("api-enabled");
const apiMin = document.getElementById("api-min");
const apiMax = document.getElementById("api-max");
const dbEnabled = document.getElementById("db-enabled");
const dbMin = document.getElementById("db-min");
const dbMax = document.getElementById("db-max");
const errorRate = document.getElementById("error-rate");
const configCurrent = document.getElementById("config-current");
const configForm = document.getElementById("config-form");
const configReset = document.getElementById("config-reset");

function renderConfig(cfg) {
  apiEnabled.checked = cfg.apiLatency.enabled;
  apiMin.value = cfg.apiLatency.minMs;
  apiMax.value = cfg.apiLatency.maxMs;
  dbEnabled.checked = cfg.dbLatency.enabled;
  dbMin.value = cfg.dbLatency.minMs;
  dbMax.value = cfg.dbLatency.maxMs;
  errorRate.value = Math.round(cfg.errorRate * 100);
  configCurrent.textContent = JSON.stringify(cfg, null, 2);
}

async function loadConfig() {
  renderConfig(await api("/api/config"));
}

configForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const cfg = await api("/api/config", {
      method: "PUT",
      body: JSON.stringify({
        apiLatency: { enabled: apiEnabled.checked, minMs: Number(apiMin.value), maxMs: Number(apiMax.value) },
        dbLatency: { enabled: dbEnabled.checked, minMs: Number(dbMin.value), maxMs: Number(dbMax.value) },
        errorRate: Number(errorRate.value) / 100,
      }),
    });
    renderConfig(cfg);
  } catch (err) {
    configCurrent.textContent = `Errore: ${err.message}`;
  }
});

configReset.addEventListener("click", async () => {
  renderConfig(await api("/api/config/reset", { method: "POST" }));
});

// --- Metrics ---

const metricsWindow = document.getElementById("metrics-window");
const metricsAuto = document.getElementById("metrics-auto");
const metricsRefresh = document.getElementById("metrics-refresh");
const metricsReset = document.getElementById("metrics-reset");
const metricsTableBody = document.querySelector("#metrics-table tbody");

async function loadMetrics() {
  try {
    const { routes } = await api(`/api/metrics/summary?minutes=${metricsWindow.value}`);
    metricsTableBody.innerHTML = "";
    for (const r of routes) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.method}</td><td>${r.path}</td><td>${r.count}</td>
        <td>${r.avg_ms}</td><td>${r.p50_ms}</td><td>${r.p95_ms}</td><td>${r.p99_ms}</td>
        <td>${r.avg_db_ms}</td><td>${r.errors}</td>`;
      metricsTableBody.appendChild(tr);
    }
  } catch (err) {
    metricsTableBody.innerHTML = `<tr><td colspan="9">Errore: ${err.message}</td></tr>`;
  }
}

metricsRefresh.addEventListener("click", loadMetrics);
metricsWindow.addEventListener("change", loadMetrics);
metricsReset.addEventListener("click", async () => {
  await api("/api/metrics", { method: "DELETE" });
  await loadMetrics();
});

let autoTimer = null;
metricsAuto.addEventListener("change", () => {
  if (metricsAuto.checked) {
    autoTimer = setInterval(loadMetrics, 5000);
  } else if (autoTimer) {
    clearInterval(autoTimer);
  }
});

loadTodos();
loadConfig();
loadMetrics();
