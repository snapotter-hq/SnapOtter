---
description: "Tutte le variabili d'ambiente di SnapOtter con i valori predefiniti. Configuri autenticazione, storage, modelli AI, analytics e altro."
i18n_source_hash: caa895c0ba16
i18n_provenance: machine
i18n_output_hash: d0c7ff67abb9
i18n_hash_version: 2
---

# Configurazione {#configuration}

Tutta la configurazione avviene tramite variabili d'ambiente. Ogni variabile ha un valore predefinito sensato, quindi SnapOtter funziona subito senza impostarne alcuna.

## Variabili d'ambiente {#environment-variables}

### Server {#server}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `PORT` | `1349` | Porta su cui il server è in ascolto. |
| `BASE_PATH` | (vuoto) | Percorso pubblico di deployment, ad es. `/snapotter`. Se vuoto o `/`, il servizio risponde alla radice del dominio. Applicato a runtime; non è necessario ricostruire l'immagine. |
| `RATE_LIMIT_PER_MIN` | `1000` | Numero massimo di richieste al minuto per IP. Imposti 0 per disattivare il rate limiting. |
| `CORS_ORIGIN` | (vuoto) | Origini consentite per CORS, separate da virgole, oppure vuoto per consentire solo la stessa origine. |
| `LOG_LEVEL` | `info` | Livello di dettaglio dei log. Uno tra: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Quali peer possono impostare l'IP del client tramite `X-Forwarded-For`. Il valore predefinito si fida solo di un peer su rete privata, quindi un reverse proxy su una rete Docker o su una LAN è considerato attendibile, mentre l'header falsificato di un client pubblico no. Imposti `true` solo quando un proxy sotto il Suo controllo si trova davanti a un indirizzo pubblico. |

### Autenticazione {#authentication}

I due booleani qui sotto accettano solo `true` e `false`. Qualsiasi altro valore, `1` o `yes` o `on`, non supera la validazione e il server termina prima di mettersi in ascolto.

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `AUTH_ENABLED` | `true` | Richiede un login. Imposti `false` per funzionare senza alcun account, il che concede i diritti di amministratore a ogni richiesta: limiti quindi l'uso a una rete attendibile. |
| `DEFAULT_USERNAME` | `admin` | Nome utente dell'account amministratore iniziale. Usato solo al primo avvio. |
| `DEFAULT_PASSWORD` | `admin` | Password dell'account amministratore iniziale. La cambi dopo il primo accesso. |
| `MAX_USERS` | `0` (illimitato) | Numero massimo di account utente registrati. Imposti 0 per nessun limite. |
| `SESSION_DURATION_HOURS` | `168` | Durata della sessione di login in ore (il valore predefinito è 7 giorni). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Imposti `true` per saltare la richiesta obbligatoria di cambio password al primo accesso. |

### Storage {#storage}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` oppure `s3`. S3 e MinIO richiedono una licenza con la funzione s3_storage e le variabili `S3_*` riportate più avanti. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | Stringa di connessione a PostgreSQL e connessione su cui viene servita ogni richiesta. Dalla versione 2.3.0 in poi, impostando anche `DATABASE_MIGRATION_URL` diventa il ruolo di runtime a privilegi minimi, con DML sulle tabelle dell'app e nient'altro. Lo stack Compose la punta al proprio servizio `postgres`; la lasci non impostata (insieme a `REDIS_URL`) per ottenere la modalità embedded. |
| `DATABASE_MIGRATION_URL` | (vuoto) | Connessione privilegiata, usata solo durante l'avvio per eseguire le migrazioni e concedere i privilegi al ruolo di runtime, poi chiusa prima della prima richiesta. Se la lascia vuota, SnapOtter funziona con un solo ruolo, e `DATABASE_URL` svolge entrambi i compiti. Vedere [Ruoli a privilegi minimi](/it/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Stringa di connessione a Redis (usata per le code di job BullMQ). Compose la punta al proprio servizio `redis`. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Directory per i file temporanei durante l'elaborazione. Ripulita automaticamente. L'immagine imposta `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Directory per i file utente persistenti (immagini caricate, risultati salvati). L'immagine imposta `/data/files`. |

### Storage a oggetti S3 {#s3-object-storage}

Letto solo quando `STORAGE_MODE=s3`. Se manca una delle tre variabili obbligatorie, l'avvio non riesce e indica il nome della variabile omessa.

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `S3_BUCKET` | (vuoto) | Bucket che contiene upload e output. Obbligatorio. |
| `S3_ACCESS_KEY_ID` | (vuoto) | Chiave di accesso. Obbligatoria. Nel container può invece montarla come file, tramite `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (vuoto) | Chiave segreta. Obbligatoria. Stessa convenzione dei file: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Regione del bucket. |
| `S3_ENDPOINT` | (vuoto) | Endpoint personalizzato per MinIO, R2, Backblaze e altri storage compatibili con S3. Se vuoto, si usa AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Imposti `true` per MinIO e per tutto ciò che richiede `endpoint/bucket/key` invece dell'indirizzamento virtual-host. |
| `S3_PREFIX` | (vuoto) | Prefisso delle chiavi, così un solo bucket può ospitare più istanze. |

### Cifratura a riposo {#encryption-at-rest}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (vuoto) | 64 caratteri esadecimali (32 byte). Cifra le impostazioni sensibili salvate nel database. Qualsiasi valore che non sia di 64 caratteri esadecimali viene rifiutato all'avvio. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (vuoto) | La chiave che sta sostituendo, nello stesso formato. Imposti entrambe durante una rotazione, così le righe esistenti si decifrano ancora, poi rimuova questa. |

### Modalità embedded {#embedded-mode}

Se avvia l'immagine senza `DATABASE_URL` e senza `REDIS_URL`, questa avvia al proprio interno PostgreSQL 17 e Redis, associati al loopback, con tutti i dati sul volume `/data`. Ripristina così l'esperienza a singolo comando `docker run` per l'avvio rapido, l'homelab e gli aggiornamenti dalla 1.x. È un percorso di comodità, non un deployment di produzione: in produzione, esegua lo stack Compose a 3 container con PostgreSQL e Redis separati. La modalità embedded richiede di eseguire il container come root ed è incompatibile con i runtime a UID arbitrario (OpenShift, Kubernetes `runAsNonRoot`); lì usi Compose.

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `EMBEDDED` | `auto` | Abilitata automaticamente quando `DATABASE_URL` e `REDIS_URL` non sono impostate. Imposti `0` per disattivarla (l'app allora termina subito se non è impostato alcun `DATABASE_URL`/`REDIS_URL` esterno, invece di avviare silenziosamente un database interno al container). |
| `REDIS_MAXMEMORY` | `512mb` | Limite di memoria per il Redis embedded (solo in modalità embedded). Lo riduca sugli host con poca memoria, come un Raspberry Pi. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Secondi di attesa dell'avvio perché il Redis embedded risponda a `PING` prima di rinunciare. Allo scadere il container si ferma e ne registra il motivo, invece di bloccarsi. Secondi interi da 1 a 999999; non esiste un valore illimitato, perché attendere all'infinito è proprio il guasto che questo limite serve a evitare. Lo aumenti solo se un host lento lo fa scattare. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Lo stesso, per il PostgreSQL embedded. Il conteggio parte dopo il termine di `initdb` al primo avvio, quindi copre l'avvio del server e il crash recovery, non la creazione iniziale del database. |

Aggiornamento dalla 1.x: collochi il Suo vecchio `snapotter.db` in `/data/snapotter.db` nel volume e la modalità embedded lo importa nel PostgreSQL embedded al primo avvio. L'importazione viene eseguita una sola volta; gli avvii successivi la saltano.

Nota sulla telemetria: la modalità embedded eredita l'impostazione predefinita di analytics dell'immagine, come qualsiasi altra configurazione. L'immagine pubblicata viene distribuita con analytics attivo; compili con `--build-arg SNAPOTTER_ANALYTICS=off`, oppure usi l'opt-out dell'amministratore nell'app, per disattivarlo.

### Limiti di elaborazione {#processing-limits}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (illimitato) | Dimensione massima del file per upload in megabyte. Imposti 0 per nessun limite. L'immagine pubblicata include `0`; una build da sorgente parte da 100. |
| `MAX_BATCH_SIZE` | `0` (illimitato) | Numero massimo di file in una singola richiesta batch. Imposti 0 per nessun limite. L'immagine pubblicata include `0`; una build da sorgente parte da 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Numero di job batch eseguiti in parallelo. Imposti 0 per il rilevamento automatico in base ai core CPU disponibili. |
| `MAX_MEGAPIXELS` | `0` (illimitato) | Risoluzione massima consentita per le immagini, in megapixel. Imposti 0 per nessun limite. |
| `MAX_WORKER_THREADS` | `0` (auto) | Numero massimo di worker thread per l'elaborazione delle immagini. Imposti 0 per il rilevamento automatico in base ai core CPU disponibili. |
| `PROCESSING_TIMEOUT_S` | `0` (nessun limite) | Tempo massimo di elaborazione per richiesta in secondi. Imposti 0 per nessun timeout. |
| `MAX_PIPELINE_STEPS` | `20` | Numero massimo di passaggi in una pipeline. Imposti 0 per nessun limite. |
| `MAX_CANVAS_PIXELS` | `0` (nessun limite) | Dimensione massima del canvas in pixel per le immagini in output. Imposti 0 per nessun limite. |
| `MAX_SVG_SIZE_MB` | `50` | SVG più grande accettato prima della sanitizzazione, in megabyte. `0` qui si comporta diversamente dalle righe vicine: elimina del tutto il limite di dimensione prima del parsing invece di alzarlo, quindi lasci questa variabile impostata. |
| `MAX_PDF_PAGES` | `0` (illimitato) | Numero massimo di pagine PDF per la conversione da PDF a immagine. Imposti 0 per nessun limite. |

### Motori {#engines}

SnapOtter cerca ogni binario di elaborazione in `$PATH` all'interno del container, quindi queste variabili restano vuote a meno che non monti una Sua build.

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `FFMPEG_PATH` | (vuoto) | Percorso del binario `ffmpeg` alla base degli strumenti video e audio. |
| `FFPROBE_PATH` | (vuoto) | Percorso di `ffprobe`, che legge i file multimediali prima dell'elaborazione. Lo punti alla stessa build di `FFMPEG_PATH`. |
| `QPDF_PATH` | (vuoto) | Percorso di `qpdf`, usato dagli strumenti PDF e per controllare i PDF caricati. |
| `SOFFICE_PATH` | (vuoto) | Percorso di `soffice` di LibreOffice, usato per le conversioni di documenti office. |
| `PDFCPU_PATH` | (vuoto) | Percorso di `pdfcpu`, usato da alcuni strumenti PDF. |
| `SNAPOTTER_HW_ACCEL` | (vuoto) | Famiglia di encoder video hardware, `nvenc` oppure `vaapi`. Se vuoto, la codifica avviene via software. |

`SNAPOTTER_HW_ACCEL` richiede un ffmpeg compilato con quella famiglia di encoder, e l'ffmpeg incluso nell'immagine non ne ha nessuna. Con il binario dell'immagine l'impostazione ricade sulla codifica software e lo segnala nel log di avvio. Per usarla, monti una Sua build di ffmpeg, punti `FFMPEG_PATH` e `FFPROBE_PATH` a essa e assegni al container il dispositivo GPU. Per `nvenc` imposti anche `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: l'immagine richiede solo `compute,utility`, e senza `video` il runtime NVIDIA non monta la libreria di codifica, quindi l'encoder risulta elencato ma ogni codifica fallisce. Anche un override di percorso inesistente o non eseguibile viene segnalato nel log di avvio, e ogni job che richiede quel binario fallisce finché non corregge il percorso o lo rimuove.

I file Compose pubblicati passano tutte e sei le variabili da `.env`, quindi è sufficiente impostarle lì.

### Pulizia {#cleanup}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Per quanto tempo i risultati di elaborazione non salvati (upload grezzi e output degli strumenti) vengono conservati prima dell'eliminazione automatica. I file che salva esplicitamente nella libreria File non sono interessati e restano finché non li elimina. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Frequenza di esecuzione del job di pulizia. |

### Aspetto {#appearance}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `DEFAULT_THEME` | `light` | Tema predefinito per le nuove sessioni. `light`, `dark` oppure `system`. |
| `DEFAULT_LOCALE` | `en` | Lingua predefinita dell'interfaccia. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Layout predefinito degli strumenti. `sidebar` oppure `fullscreen`. |

### Permessi Docker {#docker-permissions}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `PUID` | `999` | Esegue il processo del container con questo UID. Lo faccia corrispondere al Suo utente host per i bind mount (`id -u`). |
| `PGID` | `999` | Esegue il processo del container con questo GID. Lo faccia corrispondere al Suo gruppo host per i bind mount (`id -g`). |

## Esempio Docker {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Volumi {#volumes}

Lo stack Docker Compose usa quattro volumi:

- `/data` (app) - Modelli AI, venv Python e file utente. Lo monti per conservare i file caricati e i bundle AI installati tra un riavvio e l'altro.
- `/tmp/workspace` (app) - Storage temporaneo per i file in elaborazione. Può essere effimero, ma montarlo evita di riempire il livello scrivibile del container.
- `SnapOtter-pgdata` (postgres) - Directory dei dati di PostgreSQL. Contiene tutti i dati relazionali (utenti, impostazioni, pipeline, job, audit log). Ne faccia il backup tramite `pg_dump` o uno snapshot del volume.
- `SnapOtter-redisdata` (redis) - File append-only di Redis per code di job durevoli.
