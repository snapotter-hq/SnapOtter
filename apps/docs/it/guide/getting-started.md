---
description: "Installare SnapOtter con Docker in un solo comando, accedere e aprire il primo strumento. Copre l'accelerazione GPU, le macchine piccole, Docker Compose e la compilazione da sorgente."
i18n_source_hash: c2aae540add0
i18n_provenance: machine
i18n_output_hash: 963ba4786a57
i18n_hash_version: 2
---

# Per iniziare {#getting-started}

::: tip Provi prima di installare
Esplori l'interfaccia completa su [demo.snapotter.com](https://demo.snapotter.com), senza registrazione né installazione.
:::

## Avvio rapido {#quick-start}

Esegua un solo comando:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Poi apra [http://localhost:1349](http://localhost:1349) e acceda con `admin` / `admin`. Al primo accesso Le verrà chiesto di cambiare la password.

Ora apra uno strumento. Ne scelga uno dalla barra laterale oppure vada direttamente a [Ridimensiona](http://localhost:1349/image/resize), trascini un'immagine e scarichi il risultato.

Questa è l'intera installazione. Questo singolo container esegue tutto ciò di cui ha bisogno: se `DATABASE_URL` non è impostato, avvia i propri PostgreSQL e Redis sull'interfaccia di loopback (modalità incorporata) e conserva tutti i dati nel volume `SnapOtter-data`. È il modo più rapido per provare SnapOtter o per il self-hosting in un homelab. La modalità incorporata viene eseguita come root (impostazione predefinita) e si disattiva automaticamente non appena imposta `DATABASE_URL`. Per la produzione, usi lo [stack Docker Compose](#docker-compose), che mantiene PostgreSQL e Redis nei propri container.

I risultati dei job non vengono conservati nel volume dei dati, quindi scompaiono quando il container viene sostituito (per esempio con un aggiornamento dell'immagine) e i loro link di download smettono di funzionare. [Conservare l'output dei job](/it/guide/deployment#keeping-job-output) nella guida alla distribuzione spiega come mantenerli.

::: tip Uso con 4 GB di RAM o meno
Su un Raspberry Pi, un vecchio portatile o un piccolo VPS, esegua un job alla volta e limiti il pool di thread delle immagini aggiungendo `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2` al comando qui sopra, e salti i bundle AI più pesanti. [Configurazioni a risorse limitate](/it/guide/low-resource#tuning-knobs) elenca gli altri limiti utili da impostare e cosa aspettarsi da un hardware limitato.
:::

::: tip Analytics di prodotto anonime
SnapOtter include per impostazione predefinita analytics di prodotto anonime. Per disattivarle, apra **Impostazioni → Sistema → Privacy** e disattivi **Analytics di prodotto anonime**. Si interrompono immediatamente per l'intera istanza.

Può anche impostare la variabile d'ambiente `SNAPOTTER_TELEMETRY=0` (funzionano anche `false` e `off`) per disabilitare tutta la telemetria dell'istanza senza ricompilare.

Il monitoraggio degli errori è fornito da [Sentry](https://sentry.io), che sponsorizza SnapOtter tramite il proprio programma open source.

Per i dettagli su cosa viene raccolto, consulti [Cosa raccoglie SnapOtter](/it/guide/telemetry).
:::

## Accelerazione GPU {#gpu-acceleration}

Una GPU NVIDIA rende molto più veloci gli strumenti AI più pesanti: upscaling (circa 47 volte), miglioramento dei volti (circa 12 volte), trascrizione e rimozione dello sfondo (circa 4 volte ciascuna). OCR, rilevamento dei volti e ripristino delle foto restano basati su CPU, quindi una GPU non li aiuta. La stessa immagine copre entrambi i casi; aggiunga `--gpus all`:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Richiede il [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) sull'host. Senza CUDA, SnapOtter ripiega automaticamente sulla CPU. L'accelerazione iGPU Intel/AMD tramite VA-API, Quick Sync o OpenCL non è attualmente supportata per l'inferenza AI.

- [Requisiti hardware](/it/guide/deployment#full-ai-tools-on-nvidia-cuda) riporta tutti i tempi GPU e CPU, e i [benchmark dell'immagine Docker](/it/guide/docker-tags#benchmarks) i valori a caldo e a freddo.
- Se gli strumenti AI girano comunque su CPU, consulti [Verificare l'accelerazione GPU](/it/guide/deployment#verify-gpu-acceleration).
- Per Compose, usi l'[avvio rapido NVIDIA CUDA](/it/guide/deployment#quick-start-nvidia-cuda) nella guida alla distribuzione.

## Altri modi per installare {#other-ways-to-install}

### Container singolo con Compose {#single-container-compose}

Lo stesso container in modalità incorporata dell'avvio rapido, scritto come file Compose per tenerlo più facilmente sotto controllo e modificarlo. Lo salvi come `docker-compose.yml` ed esegua `docker compose up -d`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

Come il comando `docker run`, serve per provare SnapOtter e per piccole installazioni. Ogni impostazione di [Configurazione](/it/guide/configuration) va sotto `environment`.

### Docker Compose (produzione) {#docker-compose}

Usi il file di produzione mantenuto e testato a ogni rilascio invece di copiare da questa pagina un esempio Compose abbreviato:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Apra [http://localhost:1349](http://localhost:1349) e acceda con `admin` / `admin`.

Il [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) canonico include tutti e quattro i volumi di runtime, i controlli dello stato, i limiti di risorse, la configurazione Redis durevole, le immagini di database/cache bloccate e l'attuale hardening del container. Cambi subito la password amministratore predefinita dopo il primo accesso. Per una distribuzione riproducibile, blocchi l'immagine applicativa di SnapOtter al tag di rilascio o al digest che ha verificato, invece di seguire `latest`.

Per tutte le variabili d'ambiente consulti [Configurazione](/it/guide/configuration), e per segreti, policy di rete e indicazioni sui backup consulti [Sicurezza e hardening](/it/guide/security).

### GitHub Container Registry {#ghcr}

Docker Hub e GHCR pubblicano la stessa immagine a ogni rilascio. Per scaricarla da GHCR, cambi il nome dell'immagine:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### Compilare da sorgente {#build-from-source}

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

## Cosa si può fare {#what-you-can-do}

### Elaborazione di file (200+ strumenti) {#file-processing-200-tools}

| Modalità | Numero | Strumenti di esempio |
|----------|-------|---------------|
| **Immagine** | 112 | Ridimensiona, Ritaglia, Comprimi, Converti, Rimuovi sfondo, Upscale, OCR, Filigrana, Collage, Colorize, Strumenti GIF, preset di formato |
| **Video** | 59 | Taglia, Ritaglia, Comprimi, Converti, Unisci, Estrai audio, Sottotitoli automatici, Da video a GIF, Ridimensiona, Stabilizza, preset di formato |
| **Audio** | 27 | Taglia, Unisci, Converti, Normalizza, Riduzione del rumore, Trascrivi, Cambio di tonalità, Dissolvenza, Creatore di suonerie, preset di formato |
| **PDF / Documento** | 35 | Unisci, Dividi, Comprimi, OCR, Filigrana, Redigi, Da Word a PDF, Da Excel a PDF, Ruota, Proteggi, Ripara |
| **File** | 25 | Da CSV a JSON, Da JSON a XML, Unisci CSV, Dividi CSV, Crea ZIP, Estrai ZIP, Creatore di grafici, YAML/JSON |

### Pipelines {#pipelines}

Concateni gli strumenti in flussi di lavoro a più passaggi e li applichi a una sola immagine o a un intero batch:

1. Apra **Pipeline** nella barra laterale.
2. Aggiunga i passaggi (qualsiasi strumento, qualsiasi impostazione).
3. Esegua su un singolo file, oppure su un intero batch in una volta.
4. Salvi la pipeline per riutilizzarla in seguito.

Per impostazione predefinita le pipeline ammettono 20 passaggi. Imposti `MAX_PIPELINE_STEPS=0` per rendere il limite illimitato.

### Libreria dei file {#file-library}

Ogni file elaborato può essere salvato nella libreria **File**. SnapOtter tiene traccia della cronologia completa delle versioni, così può ripercorrere ogni passaggio di elaborazione dall'upload originale all'output finale.

Il salvataggio è esplicito: i risultati salvati nella libreria vengono conservati finché non li elimina, mentre i risultati elaborati e non salvati vengono rimossi automaticamente dopo 72 ore (configurabile tramite `FILE_MAX_AGE_HOURS`).

### REST API e chiavi API {#rest-api-api-keys}

Ogni strumento è accessibile via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Generi le chiavi API in **Impostazioni → Chiavi API**. Consulti il [riferimento REST API](/it/api/rest) per tutti gli endpoint, oppure visiti [http://localhost:1349/api/docs](http://localhost:1349/api/docs) per il riferimento interattivo.

### Multiutente e team {#multi-user-teams}

Abiliti più utenti con controllo degli accessi basato sui ruoli:

- **Admin**: accesso completo, gestisce utenti, team, impostazioni e tutti i file/pipeline/chiavi API
- **Utente**: usa gli strumenti, gestisce i propri file/pipeline/chiavi API

Crei i team in **Impostazioni → Team** per raggruppare gli utenti.

Imposti `AUTH_ENABLED=true` (oppure `false` per uso singolo/personale senza login).

## Usarlo dal telefono {#use-it-from-your-phone}

SnapOtter funziona nei browser mobili e può essere installato come app. Apra la Sua istanza sul telefono, poi:

- **iPhone / iPad (Safari):** tocchi Condividi, quindi **Aggiungi alla schermata Home**.
- **Android (Chrome):** apra il menu del browser e tocchi **Installa app**.

L'app installata si apre in una finestra propria, direttamente sulla Sua istanza.

Un'avvertenza: i browser propongono l'installazione solo tramite HTTPS. Un semplice indirizzo HTTP sulla Sua LAN funziona comunque bene in una scheda del browser; per l'installazione vera e propria, posizioni l'istanza dietro un reverse proxy con un certificato (consulti la [guida alla distribuzione](/it/guide/deployment)).

Su telefoni e tablet, gli strumenti per immagini mostrano un pulsante **Scatta foto** accanto al pulsante di caricamento. Fotografi una ricevuta o una lavagna e arriva direttamente nello strumento.
