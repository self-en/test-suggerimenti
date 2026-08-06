import { useEffect, useState } from "react";
import { api, type ChaosConfig } from "./api";

// The chaos knob is process-local on the backend (see src/chaosConfig.ts), so
// this panel always renders whatever the server just returned rather than
// keeping its own optimistic copy.
export default function ChaosPanel() {
  const [cfg, setCfg] = useState<ChaosConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ChaosConfig>("/api/config")
      .then(setCfg)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (!cfg) {
    return (
      <section className="card">
        <h2>Chaos config</h2>
        <p className="status">{error ? `Errore: ${error}` : "Caricamento…"}</p>
      </section>
    );
  }

  // Local edits go straight into `cfg`; nothing is applied until "Salva".
  const patch = (p: Partial<ChaosConfig>) => setCfg({ ...cfg, ...p });

  async function send(path: string, opts: RequestInit) {
    try {
      setCfg(await api<ChaosConfig>(path, opts));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="card">
      <h2>Chaos config</h2>
      <p className="hint">
        Applicata solo alle rotte <code>/api/todos*</code>. Puoi anche forzare un singolo test senza toccare la
        config globale con i query param <code>?apiDelayMs=</code>, <code>?dbDelayMs=</code>, <code>?fail=true</code>.
      </p>

      <form
        className="config-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void send("/api/config", { method: "PUT", body: JSON.stringify(cfg) });
        }}
      >
        {(["apiLatency", "dbLatency"] as const).map((key) => (
          <fieldset key={key}>
            <legend>
              <input
                type="checkbox"
                checked={cfg[key].enabled}
                onChange={(e) => patch({ [key]: { ...cfg[key], enabled: e.target.checked } } as Partial<ChaosConfig>)}
              />{" "}
              {key === "apiLatency" ? "API lenta" : "Query DB lente"}
            </legend>
            <label>
              min ms
              <input
                type="number"
                min={0}
                value={cfg[key].minMs}
                onChange={(e) =>
                  patch({ [key]: { ...cfg[key], minMs: Number(e.target.value) } } as Partial<ChaosConfig>)
                }
              />
            </label>
            <label>
              max ms
              <input
                type="number"
                min={0}
                value={cfg[key].maxMs}
                onChange={(e) =>
                  patch({ [key]: { ...cfg[key], maxMs: Number(e.target.value) } } as Partial<ChaosConfig>)
                }
              />
            </label>
          </fieldset>
        ))}

        <fieldset>
          <legend>Errori simulati</legend>
          <label>
            % richieste in errore
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round(cfg.errorRate * 100)}
              onChange={(e) => patch({ errorRate: Number(e.target.value) / 100 })}
            />
          </label>
        </fieldset>

        <div className="row">
          <button type="submit">Salva config</button>
          <button
            type="button"
            className="danger"
            onClick={() => void send("/api/config/reset", { method: "POST" })}
          >
            Reset
          </button>
        </div>
      </form>

      {error && <p className="status">Errore: {error}</p>}
      <pre className="code-block">{JSON.stringify(cfg, null, 2)}</pre>
    </section>
  );
}
