# Istruzioni operative

## Dichiara sempre le variabili d'ambiente che introduci

Se il codice ha bisogno di un valore di configurazione (password, segreto, chiave
API, URL di un servizio esterno), **nello stesso commit**:

1. dichiaralo in `self-en.json` con `label` e `description` in italiano — le legge
   una persona non tecnica nel form "Configurazione" di nedo;
2. leggilo con `config.get("NOME")` da `src/platform/config.ts`, **mai** con
   `process.env.NOME`;
3. esegui `npm run check:contract` (è anche uno step della CI: se fallisce, non
   viene pubblicata nessuna immagine e la versione non si aggiorna).

Non modificare `src/platform/config.ts` né `chart/templates/app-env-secret.yaml`:
sono gestiti dalla piattaforma (marcati `self-en-contract: <n>`) e vengono
riscritti. Non inserire valori segreti in `chart/values.yaml` o in qualunque file
del repository: si impostano dalla pagina Configurazione.

Se l'app non può funzionare senza una variabile, non farla crashare e **non far
fallire `/healthz`**: il modulo della piattaforma mostra già da solo una pagina
"da configurare" con l'elenco di ciò che manca.

## Tieni sempre aggiornato CLAUDE.md

Dopo **ogni modifica rilevante** al progetto, aggiorna il file `CLAUDE.md` nella
radice del repository, nella stessa unità di lavoro (stesso commit) della
modifica. È una regola vincolante, non un promemoria opzionale.

Conta come "modifica rilevante" (elenco non esaustivo):

- aggiunta/rimozione/rinomina di endpoint API o rotte del backend;
- cambiamenti alla struttura delle cartelle o ai file principali
  (`src/server.ts`, `src/instrumentation.ts`, `web/`, `index.html`,
  `vite.config.mts`, `tsconfig*.json`, `Dockerfile`);
- nuove dipendenze o cambi di stack (es. libreria di routing, ORM, framework);
- modifiche allo schema del database, alle migrazioni o al modo in cui l'app
  usa il database dedicato / il DB per-versione;
- cambiamenti alle variabili d'ambiente attese o al contratto con la piattaforma
  (porta, `/healthz`, variabili `PG*`, OTLP, `self-en.json`);
- modifiche alla build, al `Dockerfile` o al workflow CI.

Quando aggiorni `CLAUDE.md`:

1. correggi le sezioni interessate (struttura, database, sviluppo locale,
   contratto con la piattaforma), non limitarti ad aggiungere note in fondo;
2. mantieni le informazioni coerenti con lo stato reale del codice;
3. se una modifica rende obsoleta una parte del documento, riscrivila o rimuovila.

Non serve aggiornare `CLAUDE.md` per modifiche puramente cosmetiche (typo,
formattazione, piccoli ritocchi di stile CSS) che non cambiano struttura,
comportamento o contratto.
