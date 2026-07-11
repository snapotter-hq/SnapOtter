---
description: "Tutte le variabili d'ambiente di SnapOtter con i valori predefiniti. Configura autenticazione, archiviazione, modelli AI, analisi e altro."
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: 26b7e763f3f2
---

# Configurazione {#configuration}

Tutta la configurazione avviene tramite variabili d'ambiente. Ogni variabile ha un valore predefinito sensato, quindi SnapOtter funziona out of the box senza impostarne nessuna.

## Variabili d'ambiente {#environment-variables}

### Server {#server}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `PORT` | `1349` | Porta su cui il server è in ascolto. |
| `RATE_LIMIT_PER_MIN` | `1000` | Numero massimo di richieste al minuto per IP. Imposta a 0 per disabilitare il rate limiting. |
| `CORS_ORIGIN` | (vuoto) | Origini consentite per CORS separate da virgola, oppure vuoto per solo same-origin. |
| `LOG_LEVEL` | `info` | Verbosità dei log. Uno tra: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `true` | Considera attendibili le intestazioni `X-Forwarded-For` da un reverse proxy. Imposta a `false` se non sei dietro un proxy. |

### Autenticazione {#authentication}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `AUTH_ENABLED` | `false` | Imposta a `true` per richiedere il login. L'immagine Docker ha come predefinito `true`. |
| `DEFAULT_USERNAME` | `admin` | Nome utente per l'account admin iniziale. Usato solo alla prima esecuzione. |
| `DEFAULT_PASSWORD` | `admin` | Password per l'account admin iniziale. Cambiala dopo il primo login. |
| `MAX_USERS` | `0` (illimitato) | Numero massimo di account utente registrati. Imposta a 0 per illimitato. |
| `SESSION_DURATION_HOURS` | `168` | Durata della sessione di login in ore (il predefinito è 7 giorni). |
| `SKIP_MUST_CHANGE_PASSWORD` | - | Imposta a un qualsiasi valore non vuoto per bypassare la richiesta forzata di cambio password al primo login |

### Archiviazione {#storage}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` o `s3`. S3/MinIO richiede una licenza con la funzionalità s3_storage. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | Stringa di connessione PostgreSQL. |
| `REDIS_URL` | `redis://redis:6379` | Stringa di connessione Redis (usata per le code di lavori BullMQ). |
| `WORKSPACE_PATH` | `./tmp/workspace` | Directory per i file temporanei durante l'elaborazione. Pulita automaticamente. |
| `FILES_STORAGE_PATH` | `./data/files` | Directory per i file utente persistenti (immagini caricate, risultati salvati). |

### Modalità embedded {#embedded-mode}

Esegui l'immagine senza `DATABASE_URL` e senza `REDIS_URL` e avvia il proprio PostgreSQL 17 e Redis all'interno del container, associati al loopback, con tutti i dati sul volume `/data`. Questo ripristina l'esperienza a comando singolo `docker run` per l'avvio rapido, l'homelab e gli aggiornamenti dalla 1.x. È un percorso di comodità, non un deployment di produzione: per la produzione, esegui lo stack Compose a 3 container con PostgreSQL e Redis separati. La modalità embedded richiede l'esecuzione del container come root ed è incompatibile con i runtime a UID arbitrario (OpenShift, Kubernetes `runAsNonRoot`); lì usa Compose.

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `EMBEDDED` | `auto` | Abilitata automaticamente quando sia `DATABASE_URL` sia `REDIS_URL` non sono impostate. Imposta a `0` per disabilitarla (l'app allora fallisce rapidamente se non è impostato alcun `DATABASE_URL`/`REDIS_URL` esterno, invece di avviare silenziosamente un database in-container). |
| `REDIS_MAXMEMORY` | `512mb` | Limite di memoria per il Redis embedded (solo modalità embedded). Abbassalo su host con memoria limitata come un Raspberry Pi. |

Aggiornamento dalla 1.x: metti il tuo vecchio `snapotter.db` in `/data/snapotter.db` nel volume e la modalità embedded lo importa nel PostgreSQL embedded al primo avvio. L'importazione avviene una volta sola; gli avvii successivi la saltano.

Nota sulla telemetria: la modalità embedded eredita il valore predefinito delle analisi dell'immagine come qualsiasi altra configurazione. L'immagine pubblicata viene fornita con le analisi attive; compila con `--build-arg SNAPOTTER_ANALYTICS=off`, oppure usa l'opt-out admin in-app, per disabilitarla.

### Limiti di elaborazione {#processing-limits}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | Dimensione massima del file per upload in megabyte. Imposta a 0 per illimitato. |
| `MAX_BATCH_SIZE` | `100` | Numero massimo di file in una singola richiesta batch. Imposta a 0 per illimitato. |
| `CONCURRENT_JOBS` | `0` (auto) | Numero di lavori batch che girano in parallelo. Imposta a 0 per rilevarlo automaticamente in base ai core CPU disponibili. |
| `MAX_MEGAPIXELS` | `0` (illimitato) | Risoluzione massima dell'immagine consentita in megapixel. Imposta a 0 per illimitato. |
| `MAX_WORKER_THREADS` | `0` (auto) | Numero massimo di thread worker per l'elaborazione delle immagini. Imposta a 0 per rilevarlo automaticamente in base ai core CPU disponibili. |
| `PROCESSING_TIMEOUT_S` | `0` (nessun limite) | Tempo massimo di elaborazione per richiesta in secondi. Imposta a 0 per nessun timeout. |
| `MAX_PIPELINE_STEPS` | `20` | Numero massimo di passaggi in una pipeline. Imposta a 0 per nessun limite. |
| `MAX_CANVAS_PIXELS` | `0` (nessun limite) | Dimensione massima del canvas in pixel per le immagini di output. Imposta a 0 per nessun limite. |
| `MAX_SVG_SIZE_MB` | `0` (illimitato) | Dimensione massima del file SVG in megabyte. Imposta a 0 per illimitato. |
| `MAX_SPLIT_GRID` | `100` | Dimensione massima della griglia per lo strumento di divisione delle immagini. |
| `MAX_PDF_PAGES` | `0` (illimitato) | Numero massimo di pagine PDF per la conversione PDF-a-immagine. Imposta a 0 per illimitato. |

### Pulizia {#cleanup}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Per quanto tempo i risultati di elaborazione non salvati (upload grezzi e output degli strumenti) vengono conservati prima dell'eliminazione automatica. I file che salvi esplicitamente nella libreria File non sono interessati e persistono finché non li elimini. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Con quale frequenza viene eseguito il lavoro di pulizia. |

### Aspetto {#appearance}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `DEFAULT_THEME` | `light` | Tema predefinito per le nuove sessioni. `light` o `dark`. |
| `DEFAULT_LOCALE` | `en` | Lingua predefinita dell'interfaccia. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Layout predefinito degli strumenti. `sidebar` o `fullscreen`. |

### Permessi Docker {#docker-permissions}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `PUID` | `999` | Esegui il processo del container come questo UID. Imposta per corrispondere al tuo utente host per i bind mount (`id -u`). |
| `PGID` | `999` | Esegui il processo del container come questo GID. Imposta per corrispondere al tuo gruppo host per i bind mount (`id -g`). |

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
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

- `/data` (app) - Modelli AI, venv Python e file utente. Montalo per conservare i file caricati e i bundle AI installati tra i riavvii.
- `/tmp/workspace` (app) - Archiviazione temporanea per i file in elaborazione. Può essere effimera, ma montarlo evita di riempire il livello scrivibile del container.
- `SnapOtter-pgdata` (postgres) - Directory dati di PostgreSQL. Contiene tutti i dati relazionali (utenti, impostazioni, pipeline, lavori, log di audit). Esegui il backup tramite `pg_dump` o snapshot del volume.
- `SnapOtter-redisdata` (redis) - File append-only di Redis per code di lavori durevoli.
