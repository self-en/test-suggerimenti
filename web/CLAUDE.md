# Frontend — `web/`

Frontend React in TypeScript (`.tsx`), compilato da **Vite** in `dist/`. In
produzione non c'è un server frontend: `dist/` viene servito come file statici dal
backend Fastify (vedi `../src/CLAUDE.md`), con fallback SPA su `index.html`.

- `main.tsx` — entry point: monta `<App />` su `#root`.
- `App.tsx` — intestazione (repo, stato del database, branch da `GET /api/info`) più
  i tre pannelli.
- `Todos.tsx` — la lista dei todo: è la superficie **soggetta al chaos**.
- `ChaosPanel.tsx` — la manopola (`/api/config`): deve restare sempre reattiva,
  perché è l'unico modo per tornare indietro da una configurazione cattiva.
- `MetricsPanel.tsx` — le aggregazioni (`/api/metrics/*`).
- `api.ts` — wrapper `fetch` sottile condiviso dai tre pannelli, più i tipi.
- `App.css` — gli stili, importati da `main.tsx`.
- `../index.html` — l'entry di Vite, sta nella **radice** del repo, non qui.

Se l'app cresce oltre questi file, aggiungi sottocartelle qui (`components/`,
`hooks/`, `lib/`) invece di gonfiare `App.tsx`.

## Come parla col backend

Sempre tramite `api()` di `api.ts`, con percorsi relativi (`/api/...`), mai con un
URL assoluto o una porta esplicita: in produzione frontend e backend hanno la
**stessa origine**, quindi un host scritto a mano funzionerebbe solo in sviluppo.

`api()` fa due cose che vanno preservate se lo modifichi: trasforma un non-2xx nel
messaggio italiano che il backend mette in `{ error: "..." }` — è quello che gli
utenti leggono quando il chaos è attivo, quindi perderlo rende gli errori simulati
indistinguibili tra loro — e tratta il `204` come `null` invece di provare a
parsarne il corpo.

In sviluppo `npm run dev` fa girare Vite (`:5173`) e Fastify (`:3000`) affiancati, e
`vite.config.mts` inoltra `/api` e `/healthz` al backend. Aggiungendo un prefisso di
rotta nuovo va aggiunto anche a quel `proxy`, altrimenti funziona in produzione e dà
404 in sviluppo.

## Chaos: cosa si può forzare dalla UI

Le chiamate a `/api/todos*` accettano override deterministici via query string
(`?apiDelayMs=`, `?dbDelayMs=`, `?fail=true`) che vincono sulla config globale —
utili per riprodurre uno scenario senza toccare la manopola condivisa.

## Log

`console.log` qui è normale: è il browser. La regola "usa il logger di Fastify"
riguarda solo il backend, dove i log vanno raccolti via OTLP.

## ESM qui, CommonJS nel backend

Questo codice è ESM/TSX e lo gestisce Vite: non gira in Node a runtime, è solo build.
Il backend invece è compilato in **CommonJS** per una ragione precisa (la
strumentazione OpenTelemetry fa patching di `require`) — vedi `../src/CLAUDE.md`. È
per questo che `vite.config.mts` ha l'estensione `.mts`: `package.json` dichiara
`"type": "commonjs"`. `tsconfig.web.json` fa il type-check di questa cartella.
