import { useCallback, useEffect, useState } from "react";
import { api, type RouteSummary } from "./api";

const WINDOWS = [
  { value: 5, label: "ultimi 5 min" },
  { value: 15, label: "ultimi 15 min" },
  { value: 60, label: "ultimi 60 min" },
  { value: 360, label: "ultime 6 ore" },
];

export default function MetricsPanel() {
  const [minutes, setMinutes] = useState(60);
  const [auto, setAuto] = useState(false);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { routes } = await api<{ routes: RouteSummary[] }>(`/api/metrics/summary?minutes=${minutes}`);
      setRoutes(routes);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [minutes]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [auto, load]);

  return (
    <section className="card">
      <h2>Metriche</h2>
      <div className="row">
        <label>
          Finestra
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {WINDOWS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto-refresh (5s)
        </label>
        <button type="button" onClick={() => void load()}>
          Aggiorna
        </button>
        <button
          type="button"
          className="danger"
          onClick={() =>
            void api("/api/metrics", { method: "DELETE" })
              .then(load)
              .catch((err: Error) => setError(err.message))
          }
        >
          Svuota metriche
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Metodo</th>
            <th>Path</th>
            <th>Count</th>
            <th>Avg ms</th>
            <th>P50</th>
            <th>P95</th>
            <th>P99</th>
            <th>Avg DB ms</th>
            <th>Errori</th>
          </tr>
        </thead>
        <tbody>
          {error && (
            <tr>
              <td colSpan={9}>Errore: {error}</td>
            </tr>
          )}
          {!error && routes.length === 0 && (
            <tr>
              <td colSpan={9}>Nessuna richiesta nella finestra selezionata.</td>
            </tr>
          )}
          {!error &&
            routes.map((r) => (
              <tr key={`${r.method} ${r.path}`}>
                <td>{r.method}</td>
                <td>{r.path}</td>
                <td>{r.count}</td>
                <td>{r.avg_ms}</td>
                <td>{r.p50_ms}</td>
                <td>{r.p95_ms}</td>
                <td>{r.p99_ms}</td>
                <td>{r.avg_db_ms}</td>
                <td>{r.errors}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}
