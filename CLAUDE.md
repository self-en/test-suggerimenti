# CLAUDE.md — test-suggerimenti

Guida per Claude quando lavora su questo repository. Questo progetto è stato
generato dalla piattaforma **self-en**: ogni branch diventa un ambiente live e il
branch `main` è la produzione.

> **Regola di manutenzione**: la documentazione si aggiorna insieme al codice, e
> ogni cartella ha la propria. Dove va cosa: @.claude/instructions.md.

## Cos'è

Una **todo app** persistita su Postgres il cui scopo reale è **generare traffico
controllabilmente cattivo** — API lente, query lente, errori casuali — così che
una funzione di analisi delle metriche abbia dati veri da masticare.

Tre superfici:

- **Todo** (`/api/todos`) — il "prodotto" misurato: è l'unica parte soggetta al
  chaos.
- **Chaos config** (`/api/config`) — la manopola in memoria che decide quanto
  essere lenti/rotti. Mai rallentata né fatta fallire: dalla UI si deve sempre
  poter tornare indietro.
- **Metriche** (`/api/metrics`) — una riga per ogni richiesta a `/api/todos`
  (`request_metrics`), più le aggregazioni (p50/p95/p99 calcolati da Postgres con
  `percentile_cont`).

Applicazione web in **TypeScript** con **backend Fastify** e **frontend React**,
distribuita come **una singola immagine Docker**:

- Il frontend React (in `web/`, file `.tsx`) viene compilato da **Vite** in `dist/`.
- Il backend **Fastify** (`src/server.ts`) viene compilato da `tsc` in `build/`
  (CommonJS) e serve `dist/` come file statici, espone l'API sotto `/api/*` e la
  probe `/healthz`, con fallback SPA su `index.html`.

## Dove sta la documentazione

Questo file resta **breve di proposito**: viene caricato all'inizio di ogni
sessione, quindi contiene solo la mappa e le regole che valgono sempre. Il
dettaglio sta accanto al codice che descrive, e si carica solo quando lavori lì.

| Se lavori su | Leggi |
|---|---|
| backend: rotte, chaos, metriche, database, configurazione, log e tracce | `src/CLAUDE.md` |
| frontend React e i tre pannelli | `web/CLAUDE.md` |
| il chart Helm con cui la piattaforma distribuisce l'app | `chart/CLAUDE.md` |

### Struttura (radice del repo)

- `src/` — il backend Fastify e il bootstrap OpenTelemetry, compilati in `build/`.
  I singoli file sono elencati in `src/CLAUDE.md`.
- `web/` — il frontend React, compilato da Vite in `dist/`.
- `index.html` — entry point di Vite (monta `web/main.tsx` su `#root`).
- `tsconfig.json` — build del backend (CommonJS → `build/`). `tsconfig.web.json` —
  type-check del frontend.
- `vite.config.mts` — build del frontend in `dist/` + proxy `/api` in dev.
- `Dockerfile` — build multi-stage: stage 1 compila backend (`tsc`) e frontend
  (`vite`), stage 2 esegue con le sole dipendenze di produzione.
- `chart/` — Helm chart che la piattaforma distribuisce (Deployment + Service +
  HTTPRoute + hook PreSync che crea il database del branch). Raramente da toccare.
- `.github/workflows/ci.yml` — check del contratto, build e push dell'immagine per branch.


## Regole che valgono sempre

Sono quelle la cui violazione **non dà errore subito**: il codice compila, l'app
parte, e qualcosa smette di funzionare in silenzio. Ognuna dice dove sta il
dettaglio.

1. **Non convertire il backend a ESM.** La strumentazione OpenTelemetry fa
   monkey-patching di `require()`: in ESM trace, metriche e log si perdono senza un
   solo errore. → `src/CLAUDE.md`
2. **Usa il logger di Fastify (`app.log` / `request.log`), non `console.log`.** Solo
   il primo porta `trace_id`/`span_id` ed esce via OTLP; `console.log` non arriva in
   Grafana. → `src/CLAUDE.md`
3. **Non spostare gli hook di chaos e metriche fuori dal plugin dei todo.**
   Rallenterebbero anche `/api/config`, cioè la manopola con cui si spegne il chaos.
   → `src/CLAUDE.md`
4. **`/api/config` non va mai rallentata né fatta fallire.** È l'unica via per
   tornare indietro da una configurazione cattiva.
5. **Le variabili d'ambiente si leggono solo con `config.get("NOME")`** e vanno
   dichiarate in `self-en.json` nello stesso commit. Mai `process.env.NOME` sparso
   nel codice. → `src/CLAUDE.md`
6. **`/healthz` non deve mai fallire per configurazione mancante.** È la
   readinessProbe: se fallisce, il pod esce dal Service e il Gateway risponde 503,
   rendendo irraggiungibile la pagina "da configurare" proprio quando serve.
   → `src/CLAUDE.md`
7. **Non modificare i file della piattaforma**: `src/platform/config.ts` e
   `chart/templates/app-env-secret.yaml` sono marcati `self-en-contract: <n>` e
   vengono riscritti alla versione canonica. Le modifiche andrebbero perse.
8. **Nessun segreto nel repository** — né in `chart/values.yaml` né altrove:
   finirebbe in git. I valori si impostano dalla pagina **Configurazione** di nedo.
9. **`npm run check:contract` deve passare.** È uno step della CI: se fallisce non
   viene pubblicata nessuna immagine e la versione non si aggiorna.

## Sviluppo locale

```bash
npm install
npm run dev     # Vite (frontend, :5173) + Fastify (backend, :3000) con proxy /api
```

Serve un Postgres raggiungibile per todo e metriche:

```bash
docker run -d --name pg-todo -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres npm run dev
```

Build e avvio in modalità produzione:

```bash
npm run build      # tsc -> build/ (backend), vite -> dist/ (frontend)
npm start          # node build/server.js: Fastify serve dist/ + API su :3000
npm run typecheck  # tipi di backend e frontend, senza emettere
npm run check:contract
```


## Contratto con la piattaforma (non rompere)

- Il backend deve ascoltare sulla porta `PORT` (default 3000) e rispondere su
  `/healthz`.
- Il database si usa tramite le variabili `PG*`/`DATABASE_URL` iniettate dal chart.
- Le modifiche al codice diventano live al push del branch (la CI costruisce
  l'immagine, ArgoCD la distribuisce).
