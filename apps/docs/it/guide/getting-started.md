---
description: "Installa SnapOtter con Docker in un solo comando. Include la configurazione di Docker Compose, la compilazione dal codice sorgente e una panoramica completa delle funzionalità."
i18n_output_hash: 193499a11aa6
i18n_source_hash: 24724b5595b2
i18n_provenance: human
---

# Per iniziare {#getting-started}

::: tip Prova prima di installare
Esplora l'interfaccia completa su [demo.snapotter.com](https://demo.snapotter.com), senza registrazione né installazione.
:::

## Avvio rapido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Questo singolo container esegue tutto ciò di cui ha bisogno: senza alcun `DATABASE_URL` impostato, avvia il proprio PostgreSQL e Redis sull'interfaccia loopback (modalità integrata) e conserva tutti i dati nel volume `SnapOtter-data`. È il modo più rapido per provare SnapOtter o auto-ospitarlo su un homelab. Per la produzione, esegui lo stack [Docker Compose](#docker-compose) qui sotto, che mantiene PostgreSQL e Redis nei loro container. La modalità integrata gira come root (l'impostazione predefinita) e si disattiva automaticamente non appena imposti `DATABASE_URL`.

Ti verrà chiesto di cambiare la password al primo login.

::: tip Analytics di prodotto anonime
SnapOtter include analytics di prodotto anonime per impostazione predefinita. Per disattivarle, apri **Impostazioni → Sistema → Privacy** e disattiva **Anonymous Product Analytics**. Si ferma immediatamente per l'intera istanza.

Puoi anche impostare la variabile d'ambiente `SNAPOTTER_TELEMETRY=0` (funzionano anche `false` e `off`) per disabilitare tutta la telemetria per l'istanza senza una ricostruzione.

Il monitoraggio degli errori è basato su [Sentry](https://sentry.io), che sponsorizza SnapOtter attraverso il suo programma open-source.

Per i dettagli su ciò che viene raccolto, vedi [Cosa raccoglie SnapOtter](/it/guide/telemetry).
:::

::: tip Accelerazione NVIDIA CUDA
Aggiungi `--gpus all` per NVIDIA rimozione dello sfondo, upscaling, miglioramento del volto e ripristino accelerati da CUDA. OCR rimane basato sulla CPU e funziona nella stessa immagine con o senza accesso GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Richiede il [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Effettua automaticamente il fallback su CPU quando CUDA non è disponibile. L'accelerazione tramite iGPU Intel/AMD attraverso VA-API, Quick Sync o OpenCL non è supportata per l'inferenza AI al momento. Vedi [Tag Docker](/it/guide/docker-tags) per i benchmark.
:::

::: details Anche su GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Entrambi i registry pubblicano la stessa immagine a ogni rilascio.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Vedi [Configurazione](/it/guide/configuration) per tutte le variabili d'ambiente.

## Compilazione dal codice sorgente {#build-from-source}

**Prerequisiti:** Node.js 22+, pnpm 9+, Docker (per Postgres + Redis), Python 3.10+ (per le funzionalità AI), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## Cosa puoi fare {#what-you-can-do}

### Elaborazione di file (200+ strumenti) {#file-processing-200-tools}

| Modalità | Numero | Strumenti di esempio |
|----------|-------|---------------|
| **Immagine** | 105 | Ridimensiona, Ritaglia, Comprimi, Converti, Rimuovi sfondo, Upscaling, OCR, Filigrana, Collage, Colorizza, Strumenti GIF, preset di formato |
| **Video** | 57 | Taglia, Ritaglia, Comprimi, Converti, Unisci, Estrai audio, Sottotitoli automatici, Da video a GIF, Ridimensiona, Stabilizza, preset di formato |
| **Audio** | 27 | Taglia, Unisci, Converti, Normalizza, Riduzione del rumore, Trascrivi, Cambio di tonalità, Dissolvenza, Creatore di suonerie, preset di formato |
| **PDF / Documenti** | 42 | Unisci, Dividi, Comprimi, OCR, Filigrana, Oscura, Da Word a PDF, Da Excel a PDF, Ruota, Proteggi, Ripara |
| **File** | 10 | Da CSV a JSON, Da JSON a XML, Unisci CSV, Dividi CSV, Crea ZIP, Estrai ZIP, Creatore di grafici, YAML/JSON |

### Pipeline {#pipelines}

Concatena gli strumenti in flussi di lavoro a più passaggi e applicali a una singola immagine o a un intero batch:

1. Apri **Pipeline** nella barra laterale.
2. Aggiungi i passaggi (qualsiasi strumento, qualsiasi impostazione).
3. Esegui su un singolo file, o su un intero batch in una volta sola.
4. Salva la pipeline per riutilizzarla in seguito.

Le pipeline consentono 20 passaggi per impostazione predefinita. Imposta `MAX_PIPELINE_STEPS=0` per rendere il limite illimitato.

### Libreria di file {#file-library}

Ogni file che elabori può essere salvato nella tua libreria **File**. SnapOtter tiene traccia della cronologia completa delle versioni, così puoi ricostruire ogni passaggio di elaborazione dall'upload originale all'output finale.

Il salvataggio è esplicito: i risultati che salvi nella libreria vengono conservati finché non li elimini, mentre i risultati che elabori e lasci non salvati vengono cancellati automaticamente dopo 72 ore (configurabile tramite `FILE_MAX_AGE_HOURS`).

### REST API e chiavi API {#rest-api-api-keys}

Ogni strumento è accessibile via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Genera chiavi API in **Impostazioni → Chiavi API**. Vedi il [riferimento REST API](/it/api/rest) per tutti gli endpoint, oppure visita [http://localhost:1349/api/docs](http://localhost:1349/api/docs) per il riferimento interattivo.

### Multi-utente e team {#multi-user-teams}

Abilita più utenti con controllo degli accessi basato sui ruoli:

- **Admin**: accesso completo, gestisce utenti, team, impostazioni, tutti i file/pipeline/chiavi API
- **Utente**: usa gli strumenti, gestisce i propri file/pipeline/chiavi API

Crea team in **Impostazioni → Team** per raggruppare gli utenti.

Imposta `AUTH_ENABLED=true` (o `false` per utente singolo/uso personale senza login).
