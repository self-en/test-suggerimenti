# todo-metrics-app

Todo app minimale con persistenza su **Postgres**, pensata soprattutto per
generare traffico "controllabilmente cattivo" — API lente, query DB lente,
errori casuali — utile per testare una funzione di analisi delle metriche.

Scaffolded originariamente dalla piattaforma **self-en** (branch preview con
Postgres per-branch): il deploy contract (`server.js`/`package.json` in root,
`/healthz`, `PORT`, `PGHOST`/`DATABASE_URL`) è invariato, `Dockerfile` e
`chart/` non sono stati toccati.

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
  riga in `request_metrics` (metodo, path normalizzato, status, durata
  totale, durata DB, quanto ritardo era simulato, se è un errore).
  - `GET /api/metrics/summary?minutes=60` — per ciascun `method+path`:
    count, avg/min/max, **p50/p95/p99** (calcolati da Postgres con
    `percentile_cont`), avg durata DB, conteggio errori.
  - `GET /api/metrics/timeseries?minutes=60` — stessa cosa ma bucketizzata
    al minuto, comoda per grafici a serie temporale.
  - `GET /api/metrics/raw?limit=100` — righe grezze, per chi vuole
    ricalcolare le proprie aggregazioni.
  - `DELETE /api/metrics` — svuota la tabella (utile prima di un run di test
    pulito).

Una UI minimale in `public/` permette di: gestire i todo, configurare il
chaos e vedere la tabella delle metriche in tempo reale (con auto-refresh).

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
  npm start
# http://localhost:3000
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

- `server.js` — entrypoint: monta le rotte, il middleware di timing/metriche,
  serve `public/` e avvia l'init dello schema in background.
- `src/db.js` — pool Postgres + creazione schema con retry.
- `src/config.js` — config chaos in-memory (get/update/reset, validata).
- `src/simulate.js` — helper di ritardo/errore artificiali.
- `src/todosRepo.js` — query dei todo, con simulazione di query lenta.
- `src/metricsStore.js` — insert + query di aggregazione delle metriche.
- `src/routes-todos.js`, `src/routes-config.js`, `src/routes-metrics.js` —
  router Express.
- `public/` — UI statica (todo list, pannello chaos, tabella metriche).

## Deploy (invariato)

- Push di un branch → CI builda l'immagine Docker → ArgoCD deploya
  `chart/`, con una PreSync job che crea il database Postgres di quel branch
  e lo passa via `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`/`DATABASE_URL`.
- Elimina il branch → preview e database vengono ripuliti automaticamente.
