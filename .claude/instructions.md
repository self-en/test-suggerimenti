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

## Tieni aggiornata la documentazione — nel file giusto

Dopo **ogni modifica rilevante** al progetto, aggiorna la documentazione nella
stessa unità di lavoro (stesso commit) della modifica. È una regola vincolante, non
un promemoria opzionale.

La parte che si sbaglia è **dove** scriverla. La documentazione è divisa per quando
serve leggerla: il `CLAUDE.md` nella radice viene caricato all'inizio di ogni
sessione, quindi ogni riga di troppo diluisce le regole che contano davvero.
Il dettaglio va nel `CLAUDE.md` della cartella che descrive, che si carica solo
quando si lavora lì.

| Cosa hai cambiato | Dove va documentato |
|---|---|
| Rotte API, uso del database, configurazione, log e tracce, struttura di `src/` | `src/CLAUDE.md` |
| Componenti, stili, build Vite, chiamate all'API dal browser | `web/CLAUDE.md` |
| Il chart Helm, i valori che riceve, le probe | `chart/CLAUDE.md` |
| Struttura generale, comandi, dipendenze e stack, build o `Dockerfile`, contratto con la piattaforma (porta, `/healthz`, `PG*`, OTLP, `self-en.json`) | `CLAUDE.md` nella radice |
| Una regola nuova la cui violazione **non dà errore subito** | la lista "Regole che valgono sempre" nella radice — una voce breve, col rimando al file che contiene il dettaglio |

Conta come "modifica rilevante" (elenco non esaustivo): aggiunta, rimozione o
rinomina di endpoint API; cambiamenti alla struttura delle cartelle o ai file
principali; nuove dipendenze o cambi di stack (routing, ORM, framework); modifiche
allo schema del database, alle migrazioni o al modo in cui l'app usa il database
per-versione; cambiamenti alle variabili d'ambiente attese o al contratto con la
piattaforma; modifiche alla build, al `Dockerfile` o al workflow CI.

Quando aggiorni:

1. **correggi le sezioni interessate, non aggiungere note in fondo.** Se una
   modifica rende obsoleta una parte del documento, riscrivila o rimuovila: due
   paragrafi che si contraddicono sono peggio di uno mancante.
2. **se una cartella nuova ha una sua logica, dalle il suo `CLAUDE.md`** e
   aggiungi una riga alla tabella nella radice. È così che la documentazione cresce
   di lato invece che in su.
3. **tieni la radice sotto le ~120 righe.** Se una modifica la fa crescere oltre,
   quasi sempre il contenuto appartiene a un file più vicino al codice.
4. mantieni le informazioni coerenti con lo stato reale del codice.

Non usare la sintassi `@percorso/file.md` per rimandare a un altro documento: gli
import in `CLAUDE.md` vengono espansi all'avvio, quindi caricano il file **sempre**
e annullerebbero il senso della divisione. Cita il percorso in prosa normale (come
fa la tabella qui sopra). L'unica eccezione è questo file, che contiene regole
sempre valide ed è per questo importato dalla radice.

Non serve aggiornare la documentazione per modifiche puramente cosmetiche (typo,
formattazione, piccoli ritocchi di stile CSS) che non cambiano struttura,
comportamento o contratto.
