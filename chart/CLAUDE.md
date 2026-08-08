# Chart Helm — `chart/`

Il chart con cui la piattaforma distribuisce questa app: **Deployment + Service +
HTTPRoute**, più un hook **PreSync** che crea il database di questa versione e un
Secret per le variabili d'ambiente. **Raramente da toccare**, e mai per
configurare: i valori arrivano da fuori.

## Chi riempie cosa

Quasi tutti i valori in `values.yaml` sono **sovrascritti per-branch**
dall'ApplicationSet della piattaforma, non da te:

- `hostname` — l'host di questa versione. Un valore scritto qui non ha effetto.
- `image.repository` (fissato alla creazione del progetto) e `image.tag`, che la
  piattaforma imposta al tag immutabile `sha-<short>` di ogni commit.
- `commitSha` — timbrato come annotazione sul pod per forzare il rollout a ogni push.
- `otel.endpoint` — non vuoto **solo** sul branch `main`: è così che metriche e
  trace sono attive in produzione e non negli ambienti temporanei.
- `postgres.*` — host e credenziali dell'istanza Postgres dedicata al progetto.
- `appEnv.encoded` — base64 di un JSON `{CHIAVE: valore}` con la configurazione
  impostata dalla pagina **Configurazione** di nedo.

## Regole

- **Nessun segreto qui.** `values.yaml` sta in git: una password scritta in questo
  file è una password pubblicata. Si impostano dalla pagina Configurazione, che è
  esattamente ciò che `appEnv.encoded` trasporta.
- **Non dichiarare quei valori come `env:` nel Deployment**: un `env:` esplicito
  **vince** su `envFrom`, quindi zittirebbe in silenzio quello che l'utente imposta
  dalla UI.
- **`templates/app-env-secret.yaml` è della piattaforma**: è marcato
  `self-en-contract: <n>` e viene riscritto alla versione canonica. Modificarlo
  significa perdere le modifiche al primo allineamento del contratto.
- **`containerPort` deve restare la porta su cui ascolta il backend** (`PORT`,
  default 3000), e la readinessProbe deve puntare a `/healthz`. Sono il contratto
  con la piattaforma: se non tornano, l'ambiente risponde 503 anche con l'app sana.
  Attenzione al caso specifico di questa app: `/healthz` risponde 200 anche mentre
  lo schema del database è ancora in provisioning, ed è voluto — vedi
  `../src/CLAUDE.md`.
- L'`HTTPRoute` deve restare agganciato al Gateway condiviso (`gateway.name` /
  `gateway.namespace`). È il modo in cui l'host della versione arriva all'app.
