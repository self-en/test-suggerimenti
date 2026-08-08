# Backend — `src/`

Backend Fastify in TypeScript, compilato da `tsc` in `build/` (CommonJS). Serve
`dist/` (il frontend, vedi `../web/CLAUDE.md`) come file statici, espone l'API sotto
`/api/*` e la probe `/healthz`, con fallback SPA su `index.html`.

## I file

- `src/server.ts` — istanza Fastify: hook di logging globale, `/healthz`,
  `/api/info`, registrazione dei tre plugin di rotte, static + fallback SPA.
- `src/routes/todos.ts` — `/api/todos` **più** i tre hook che valgono solo qui:
  chaos (ritardo + errore simulato), guardia "DB non pronto", scrittura della
  riga in `request_metrics`.
- `src/routes/chaos.ts` — `/api/config` (get/put/reset della manopola).
- `src/routes/metrics.ts` — `/api/metrics/{summary,timeseries,raw}` + `DELETE`.
- `src/chaosConfig.ts` — la config chaos in memoria (get/update/reset, validata).
  Si chiama così, e non `config.ts`, per non confonderla con
  `src/platform/config.ts`, che è tutt'altra cosa (il contratto con la piattaforma).
- `src/simulate.ts` — helper di ritardo/errore artificiali e parsing dei query param.
- `src/todosRepo.ts` — query dei todo, con simulazione di query lenta e timing.
- `src/metricsStore.ts` — insert + query di aggregazione delle metriche.
- `src/requestMetrics.ts` — il contesto per-richiesta (`request.metricsCtx`)
  condiviso fra gli hook chaos, il repo e la scrittura delle metriche.
- `src/db.ts` — pool Postgres + creazione schema con retry in background.
- `src/instrumentation.ts` — bootstrap OpenTelemetry (vedi sotto). Compilato in `build/`.

### API

- `GET /api/todos`, `POST /api/todos`, `GET|PATCH|DELETE /api/todos/:id`
- `GET|PUT /api/config`, `POST /api/config/reset`
- `GET /api/metrics/summary?minutes=60` — per `method+path`: count, avg/min/max,
  p50/p95/p99, avg durata DB, errori.
- `GET /api/metrics/timeseries?minutes=60` — le stesse cose bucketizzate al minuto.
- `GET /api/metrics/raw?limit=100` — righe grezze.
- `DELETE /api/metrics` — svuota `request_metrics`.
- `GET /api/info` — repo, stato del database, branch (lo usa la UI).
- `GET /healthz` — readinessProbe.

Ogni chiamata a `/api/todos*` accetta anche override deterministici via query
string, per script di test riproducibili: `?apiDelayMs=`, `?dbDelayMs=`,
`?fail=true`. Vincono sulla config globale.

### Perché gli hook stanno dentro il plugin dei todo

In Fastify gli hook registrati dentro un plugin valgono **solo** per le rotte di
quel plugin (incapsulamento). È esattamente ciò che serve qui: chaos e metriche
riguardano `/api/todos`, mentre `/api/config` e `/api/metrics` devono restare
veloci e affidabili. Se sposti quegli hook a livello di istanza rallenti anche la
manopola con cui si spegne il chaos.

Il timing della riga `request_metrics` usa `reply.elapsedTime` (copre tutta la
richiesta, ritardo simulato incluso) e `request.routeOptions.url` come path, così
le metriche aggregano per rotta (`/api/todos/:id`) e non una riga per id.

### Perché il backend è CommonJS

L'auto-strumentazione OpenTelemetry (attiva solo su `main`) viene precaricata con
`NODE_OPTIONS=--require /app/build/instrumentation.js`, che fa monkey-patching di
`require()`. Perché fastify/pg/pino vengano strumentati devono essere caricati con
`require`, quindi il backend TypeScript viene **compilato in CommonJS**
(`tsconfig.json`: `module`/`moduleResolution` `nodenext` + `"type": "commonjs"` in
`package.json`). Il frontend React è invece ESM/TSX gestito da Vite: non gira in
Node a runtime, è solo build. **Non convertire il backend a ESM** senza sistemare
la strumentazione, altrimenti le trace/metriche/log si perdono silenziosamente.

## Database — istanza Postgres dedicata, un DB per versione

Questo progetto ha a disposizione una **istanza Postgres dedicata** (non
condivisa con gli altri progetti della piattaforma). Al suo interno **ogni
versione (branch) ha il proprio database separato**, così la produzione (`main`)
resta isolata dalle versioni in lavorazione.

- Il database del branch viene creato automaticamente da un hook **PreSync** di
  ArgoCD (`chart/templates/db-presync-job.yaml`) prima che l'app parta. **Non
  serve crearlo a mano.**
- Lo **schema** (`todos`, `request_metrics`) lo crea l'app all'avvio,
  `src/db.ts#initSchemaWithRetry`: in background, con retry, **senza bloccare
  l'avvio del server HTTP** — il DB del branch può ancora essere in
  provisioning quando il pod parte, e `/healthz` deve rispondere comunque.
  Finché lo schema non è pronto, `/api/todos*` e `/api/metrics*` rispondono `503`.
- L'app riceve le credenziali dal chart come variabili d'ambiente Postgres
  standard: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` (più
  `DATABASE_URL` equivalente). `src/db.ts` preferisce le variabili `PG*` discrete
  (evitano problemi di URL-encoding della password).
- **Ogni versione lavora solo sul proprio database**: quando aggiungi
  tabelle/migrazioni, il codice deve applicarle al database indicato da queste
  variabili — mai puntare a mano al DB di un'altra versione.
- Alla cancellazione/fusione del branch il database viene ripulito
  automaticamente dalla piattaforma.

Senza `PG*`/`DATABASE_URL` l'app parte lo stesso (utile in locale): `/api/config`
funziona, il resto risponde `503`.

## Configurazione — variabili d'ambiente dichiarate

Tutto ciò che l'app ha bisogno di sapere e che **non** può stare nel codice
(password, segreti di sessione, chiavi API) passa da variabili d'ambiente che la
piattaforma inietta, e che l'utente imposta dalla pagina **Configurazione** del
progetto in nedo. Non si mettono valori in `chart/values.yaml`: finirebbero in git.

Il contratto è in due pezzi:

- **`self-en.json`** (radice del repo) — la **dichiarazione**, ed è tua: qui elenchi
  le variabili che servono, con un'etichetta e una descrizione **in italiano**
  (le legge una persona non tecnica nel form di nedo). Oggi è vuota: questa app
  non ha bisogno di nessuna variabile propria.

  ```json
  { "contract": 1,
    "env": [
      { "key": "APP_PASSWORD", "label": "Password di accesso",
        "description": "Serve per entrare nell'app.",
        "required": true, "secret": true, "generate": "password" }
    ] }
  ```

  `required` (default `true`) decide se l'app può funzionare senza;
  `generate` (`secret32` | `password`) fa comparire un pulsante "genera" nel form;
  `scope: "main"` suggerisce di usare quel valore **solo in produzione**.

- **`src/platform/config.ts`** — il modulo **della piattaforma**: legge
  `self-en.json`, valida l'ambiente, espone `GET /_self-en/config` (dichiarazione +
  variabili mancanti, che è come nedo sa cosa chiedere) e, se manca qualcosa di
  obbligatorio, risponde con una pagina "da configurare" al posto dell'app.
  **Non modificarlo**: è marcato `self-en-contract: <n>` e viene riscritto alla
  versione canonica dalla piattaforma. È registrato in `src/server.ts` con
  `registerPlatformConfig(app)`.

### Regole

1. Le variabili si leggono **solo** con `config.get("NOME")` (o `getOptional`),
   mai `process.env.NOME` sparso nel codice. Fanno eccezione quelle iniettate
   dalla piattaforma (`PORT`, `PG*`, `DATABASE_URL`, `OTEL_*`, `LOG_LEVEL`,
   `REPO_NAME`, `BRANCH_NAME`, `NODE_ENV`).
2. `npm run check:contract` verifica tutto questo ed è uno **step della CI**:
   una violazione rende la build rossa e nessuna immagine viene pubblicata.
3. **`/healthz` non deve mai fallire per configurazione mancante.** È la
   readinessProbe: se fallisce il pod esce dal Service, il Gateway risponde 503 e
   la pagina "da configurare" diventa irraggiungibile proprio quando serve.

## Osservabilità (automatica sul branch `main`)

Sul solo branch `main` la piattaforma abilita OpenTelemetry senza modifiche al
codice: **trace**, **metriche** e **log** vengono esportati via OTLP verso il
collector della piattaforma (Alloy → Tempo / Prometheus / Loki), consultabili in
Grafana. Il bootstrap `src/instrumentation.ts` registra la strumentazione
automatica (server HTTP, `pg`, runtime Node) **più**
`@opentelemetry/instrumentation-fastify` (span di route/handler). Sugli altri
branch la strumentazione non viene caricata.

**I log passano da `app.log` / `request.log`** (il logger `pino` integrato in
Fastify) e portano il `trace_id`/`span_id` della richiesta attiva: **usa il logger
di Fastify, non `console.log`** (quest'ultimo NON viene inviato via OTLP). È per
questo che `src/db.ts` riceve il logger invece di stampare da sé.

Il logging automatico di Fastify è **disattivato** (flag top-level
`disableRequestLogging: true` passato a `Fastify({ ... })` in `src/server.ts`)
e sostituito da un hook `onResponse` in `src/server.ts` che emette **un solo
record per richiesta** con la severità derivata dallo status: 5xx → `error`,
4xx → `warn`, resto → `info`. Il default di Fastify logga a `info` qualunque
sia l'esito, quindi una richiesta fallita non sarebbe un errore in Grafana —
che è esattamente ciò che serve vedere qui, visto che questa app gli errori li
produce apposta.

Attenzione: `disableRequestLogging` come opzione top-level è deprecata in
Fastify 5 (avviso `FSTDEP023` una tantum all'avvio, rumore innocuo — non un
errore) e verrà rimossa solo in Fastify 6. È comunque l'unica via stabile e
documentata per ottenere questo comportamento sulla riga 5.x dichiarata in
`package.json` (`^5.2.1`); da riconsiderare solo in caso di futura migrazione a
Fastify 6.

