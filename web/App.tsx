import { useEffect, useState } from "react";
import Todos from "./Todos";
import ChaosPanel from "./ChaosPanel";
import MetricsPanel from "./MetricsPanel";
import { api } from "./api";

interface Info {
  repo: string;
  database: string;
  branch: string | null;
}

// Maps the backend's dbStatus (see src/db.ts) to a label + tone.
const DB_LABELS: Record<string, { text: string; tone: string }> = {
  connected: { text: "Database connesso", tone: "ok" },
  connecting: { text: "Database non ancora pronto…", tone: "warn" },
  "not-configured": { text: "Nessun database configurato", tone: "muted" },
  unknown: { text: "Controllo database in corso…", tone: "muted" },
};

export default function App() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Info>("/api/info")
      .then(setInfo)
      .catch((err: Error) => setError(err.message));
  }, []);

  const db = DB_LABELS[info?.database ?? "unknown"] ?? DB_LABELS.unknown;

  return (
    <>
      <header>
        <h1>Todo + Chaos Metrics Lab</h1>
        <p className="subtitle">
          Una todo app persistita su Postgres, pensata per generare traffico con latenze e query lente
          controllabili — utile per testare una funzione di analisi delle metriche.
        </p>
        <div className={`badge ${error ? "warn" : db.tone}`}>{error ? `Errore API: ${error}` : db.text}</div>
        {info?.branch && <p className="subtitle">versione: {info.branch}</p>}
      </header>

      <main>
        <Todos />
        <ChaosPanel />
        <MetricsPanel />
      </main>
    </>
  );
}
