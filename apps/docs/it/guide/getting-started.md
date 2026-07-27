---
description: "Installa SnapOtter con Docker in un solo comando. Include la configurazione di Docker Compose, la compilazione dal codice sorgente e una panoramica completa delle funzionalità."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: 5061d54954a1
i18n_hash_version: 2
---

# Per iniziare {#getting-started}

::: tip Prova prima di installare
Esplora l'interfaccia completa su [demo.snapotter.com](https://demo.snapotter.com), senza registrazione né installazione.
:::

## Avvio rapido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Questo singolo contenitore esegue tutto ciò di cui ha bisogno: senza alcun set `DATABASE_URL`, avvia il proprio PostgreSQL e Redis sull'interfaccia di loopback (modalità incorporata) e mantiene tutti i dati nel volume `SnapOtter-data`. È il modo più veloce per provare SnapOtter o ospitare autonomamente un laboratorio domestico. Per la produzione, utilizzare lo [stack canonico Docker Compose](#docker-compose), che mantiene PostgreSQL e Redis nei propri contenitori. La modalità incorporata viene eseguita come root (impostazione predefinita) e si disattiva automaticamente non appena si imposta `DATABASE_URL`.

Stai installando su un Raspberry Pi, un vecchio laptop o un piccolo VPS? Vedi [Configurazioni a basse risorse](/it/guide/low-resource) per una guida già calibrata e per sapere cosa aspettarti da hardware limitato.

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

Richiede [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Ritorna automaticamente alla CPU quando CUDA non è disponibile. L'accelerazione iGPU Intel/AMD tramite VA-API, Quick Sync o OpenCL non è attualmente supportata per l'inferenza AI. Vedi [Docker Tags](/it/guide/docker-tags) per i benchmark. Se gli strumenti AI vengono eseguiti sulla CPU nonostante `--gpus all`, vedere [Verificare l'accelerazione GPU](/it/guide/deployment#verify-gpu-acceleration).
:::

::: details Anche su GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Entrambi i registry pubblicano la stessa immagine a ogni rilascio.
:::

## Docker Componi {#docker-compose}

Utilizza il file di produzione mantenuto e testato con ogni versione invece di copiare un esempio di Compose abbreviato da questa pagina:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Il [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) canonico include tutti e quattro i volumi di runtime, controlli di integrità, limiti delle risorse, configurazione Redis durevole, immagini di database/cache bloccate e l'attuale rafforzamento del contenitore. Modificare la password amministratore predefinita immediatamente dopo il primo accesso. Per una distribuzione riproducibile, aggiungi l'immagine dell'applicazione SnapOtter al tag di rilascio o al digest che hai verificato invece di seguire `latest`.

Consulta [Configurazione](/it/guide/configuration) per tutte le variabili di ambiente e [Sicurezza e protezione avanzata](/it/guide/security) per segreti, criteri di rete e indicazioni sul backup.

## Compilazione dal codice sorgente {#build-from-source}

**Prerequisiti:** Node.js 22.22+, pnpm 9+, Docker (per Postgres + Redis), Python 3.11+ (per le funzionalità AI), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## Cosa puoi fare {#what-you-can-do}

### Elaborazione di file (200+ strumenti) {#file-processing-200-tools}

| Modalità | Numero | Strumenti di esempio |
|----------|-------|---------------|
| **Immagine** | 107 | Ridimensiona, Ritaglia, Comprimi, Converti, Rimuovi sfondo, Upscaling, OCR, Filigrana, Collage, Colorizza, Strumenti GIF, preset di formato |
| **Video** | 57 | Taglia, Ritaglia, Comprimi, Converti, Unisci, Estrai audio, Sottotitoli automatici, Da video a GIF, Ridimensiona, Stabilizza, preset di formato |
| **Audio** | 27 | Taglia, Unisci, Converti, Normalizza, Riduzione del rumore, Trascrivi, Cambio di tonalità, Dissolvenza, Creatore di suonerie, preset di formato |
| **PDF / Documenti** | 29 | Unisci, Dividi, Comprimi, OCR, Filigrana, Oscura, Da Word a PDF, Da Excel a PDF, Ruota, Proteggi, Ripara |
| **File** | 23 | Da CSV a JSON, Da JSON a XML, Unisci CSV, Dividi CSV, Crea ZIP, Estrai ZIP, Creatore di grafici, YAML/JSON |

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
