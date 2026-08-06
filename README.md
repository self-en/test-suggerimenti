# test-suggerimenti

Todo app minimale con persistenza su **Postgres**, pensata soprattutto per
generare traffico "controllabilmente cattivo" — API lente, query DB lente,
errori casuali — utile per testare una funzione di analisi delle metriche.

Stack allineato allo scaffold della piattaforma **self-en**: **TypeScript**,
backend **Fastify**, frontend **React** (Vite), una sola immagine Docker,
contratto di configurazione (`self-en.json` + `src/platform/config.ts`) e
strumentazione OpenTelemetry sul branch `main`.

## Come funziona

- **Todo**: `GET/POST /api/todos`, `GET/PATCH/DELETE /api/todos/:id`,
  persistiti in Postgres (tabella `todos`).
- **Chaos config** (`/api/config`): un knob in-memory (non persistito) che
  controlla, solo per le rotte `/api/todos*`:
  - `apiLatency` — un ritardo artificiale applicato *prima* di eseguire la
    richiesta (simula un'API lenta / rete lenta);
  - `dbLatency` — un ritardo artificiale applicato *prima* di ogni query
    (simula una query lenta), sommato al vero tempo di esecuzione della query;
  - `errorRate` — probabilità (0–1) che una richiesta fallisca con `503`.
- **Metriche** (`/api/metrics`): ogni richiesta a `/api/todos*` scrive una
  riga in `request_metrics` (metodo, path normalizzato sulla rotta, status,
  durata totale, durata DB, quanto ritardo era simulato, se è un errore).
  - `GET /api/metrics/summary?minutes=60` — per ciascun `method+path`:
    count, avg/min/max, **p50/p95/p99** (calcolati da Postgres con
    `percentile_cont`), avg durata DB, conteggio errori.
  - `GET /api/metrics/timeseries?minutes=60` — stessa cosa ma bucketizzata
    al minuto, comoda per grafici a serie temporale.
  - `GET /api/metrics/raw?limit=100` — righe grezze.
  - `DELETE /api/metrics` — svuota la tabella (utile prima di un run pulito).

La UI React in `web/` permette di gestire i todo, configurare il chaos e vedere
la tabella delle metriche in tempo reale (con auto-refresh).

`/api/config` e `/api/metrics` **non** sono soggette al chaos: si deve sempre
poter spegnere la manopola dalla UI, anche mentre i todo sono lenti o rotti.

## Test deterministici per singola richiesta

Oltre alla config globale (randomizzata), ogni chiamata a `/api/todos*` può
forzare un comportamento specifico via query string, utile per script di
test riproducibili:

```bash
# forza 800ms di latenza "API" + 1200ms di latenza "DB" su questa richiesta
curl "localhost:3000/api/todos?apiDelayMs=800&dbDelayMs=1200"

# forza un errore 503 su questa richiesta, a prescindere da errorRate
curl "localhost:3000/api/todos?fail=true"
```

## Run locale

Serve un Postgres raggiungibile. Esempio con Docker:

```bash
docker run -d --name pg-todo -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine

npm install
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres \
  npm run dev    # Vite (frontend, :5173) + Fastify (backend, :3000), proxy /api
```

Come in produzione (una sola porta, frontend servito da Fastify):

```bash
npm run build && npm start   # http://localhost:3000
```

Lo schema (`todos`, `request_metrics`) viene creato automaticamente
all'avvio, con retry in background se il DB non è ancora pronto (non blocca
`/healthz`). Senza `PGHOST`/`DATABASE_URL` l'app parte comunque, ma
`/api/todos*` e `/api/metrics*` rispondono `503`.

## Esempio: generare un po' di traffico misto per testare l'analisi

```bash
curl -X PUT localhost:3000/api/config -H 'Content-Type: application/json' -d '{
  "apiLatency": {"enabled": true, "minMs": 100, "maxMs": 400},
  "dbLatency":  {"enabled": true, "minMs": 200, "maxMs": 1500},
  "errorRate": 0.1
}'

for i in $(seq 1 50); do curl -s -o /dev/null localhost:3000/api/todos; done

curl localhost:3000/api/metrics/summary?minutes=5
```

## Layout

- `src/server.ts` — istanza Fastify: logging per richiesta, `/healthz`,
  `/api/info`, registrazione dei plugin di rotte, static + fallback SPA.
- `src/routes/todos.ts` — `/api/todos` e gli hook che valgono solo lì (chaos,
  guardia DB, scrittura della riga di metrica).
- `src/routes/chaos.ts`, `src/routes/metrics.ts` — `/api/config`, `/api/metrics`.
- `src/chaosConfig.ts` — config chaos in-memory (get/update/reset, validata).
- `src/simulate.ts` — helper di ritardo/errore artificiali.
- `src/todosRepo.ts` — query dei todo, con simulazione di query lenta.
- `src/metricsStore.ts` — insert + query di aggregazione delle metriche.
- `src/db.ts` — pool Postgres + creazione schema con retry.
- `src/instrumentation.ts` — bootstrap OpenTelemetry (solo su `main`).
- `src/platform/config.ts` — modulo della piattaforma, non modificare.
- `web/` — frontend React (`App.tsx`, `Todos.tsx`, `ChaosPanel.tsx`,
  `MetricsPanel.tsx`, `api.ts`, `App.css`), compilato da Vite in `dist/`.
- `chart/` — Helm chart distribuito dalla piattaforma.
- `CLAUDE.md` / `.claude/instructions.md` — guida per Claude.

## Osservabilità (automatica sul branch `main`)

Sul solo branch `main` trace, metriche e log vanno via OTLP al collector della
piattaforma (Alloy → Tempo / Prometheus / Loki). I log passano dal logger `pino`
di Fastify (`request.log`), quindi portano il trace context; un hook `onResponse`
emette un record per richiesta con severità derivata dallo status (5xx → error).
Dettagli in `CLAUDE.md`.

## Deploy

- Push di un branch → la CI verifica il contratto (`npm run check:contract`),
  builda l'immagine Docker multi-arch e la pubblica su GHCR → ArgoCD deploya
  `chart/`, con una PreSync job che crea il database Postgres di quel branch.
- Elimina il branch → ambiente e database vengono ripuliti automaticamente.
