---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: f2f9e85e5786
i18n_hash_version: 2
---
# Configurazioni a risorse limitate {#low-resource-setups}

SnapOtter funziona bene su hardware di piccole dimensioni: un Raspberry Pi 4 o 5, un vecchio portatile o un VPS da 2 GB. Questa pagina è la guida pratica per quelle macchine: cosa aspettarsi, una configurazione da copiare e incollare con limiti sensati e quali funzionalità saltare. I dati completi dei benchmark alla base di questi numeri si trovano in [Requisiti hardware](/it/guide/deployment#hardware-requirements).

Due vincoli rigidi in anticipo:

- **Solo 64 bit.** L'immagine è compilata per `linux/amd64` e `linux/arm64`. L'ARM a 32 bit (`armv7`/`armhf`) non è supportato, quindi i Pi di prima generazione e la famiglia Pi Zero sono esclusi.
- **Soglia di memoria di 2 GB (strumenti non AI).** 512 MB non bastano per avviare lo stack, e 1 GB fallisce sui batch di più file. 2 GB con 2 core è la configurazione più piccola che esegue comodamente gli strumenti non AI.

## Cosa funziona bene su hardware piccolo {#what-runs-well}

Ogni strumento non AI funziona su una macchina da 2 GB / 2 core: tutte le sezioni Immagini e File, gli strumenti PDF e le operazioni video e audio con copia dello stream (taglio, disattivazione audio, remux del contenitore). La maggior parte termina in meno di un secondo.

Due carichi di lavoro fanno eccezione:

- La **ricodifica video** (conversione tra codec) dipende dalla CPU. Una clip 1080p che richiede ~40 s su una CPU desktop veloce può richiedere diversi minuti su una CPU di classe Pi. Le operazioni con copia dello stream restano istantanee.
- Gli **strumenti AI** hanno soglie di memoria CPU per singolo bundle: 2 GB di RAM host (0,5 GB liberi) per Rilevamento volti e OCR Fast integrato, 4 GiB di memoria effettiva configurata per OCR accurato, 4 GB di RAM host (da 2 a 3 GB liberi) per Trascrizione, Cancellazione oggetti e Colorize, Rimozione sfondo, Upscale e miglioramento e Ripristino foto, e 8 GB di RAM host (6 GB liberi) per l'inpainting di alta qualità. Una macchina da 2 GB non può eseguire Whisper, RealESRGAN, rembg o LaMa senza essere terminata per esaurimento della memoria, quindi SnapOtter controlla la memoria libera prima di inviare al sidecar Python e rifiuta immediatamente le esecuzioni sotto la soglia del bundle.

Nessuno dei due è installato o in esecuzione se non lo usa: senza bundle AI installati l'app resta a riposo intorno ai 360 MB, e i bundle AI vengono scaricati solo quando un amministratore li abilita.

## Guida per Raspberry Pi / vecchio portatile {#walkthrough}

Questa è la normale installazione Compose da [Per iniziare](/it/guide/getting-started), più limiti di risorse e soglie prudenti. Presuppone un sistema operativo a 64 bit (su un Pi: Raspberry Pi OS 64 bit o Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Note per le macchine di classe Pi:

- **Preferisca un SSD USB a una scheda SD** per il volume dati e per Postgres. Gli spazi di lavoro dei job eseguono vero I/O su disco, e le schede SD sono sia lente sia soggette a usura rapida.
- **Anche il container singolo all-in-one funziona qui** (Postgres e Redis incorporati quando `DATABASE_URL`/`REDIS_URL` non sono impostati), e su un host con poca memoria dovrebbe abbassare il limite del suo Redis incorporato con `REDIS_MAXMEMORY` (consulti [Configurazione](/it/guide/configuration)). Compose offre un controllo più fine per ogni servizio, ed è per questo che questa guida lo usa.
- **Aggiunga swap sui dispositivi da 2 GB.** Evita che un picco occasionale (un PDF grande, un batch che si è dimenticato di limitare) finisca con un'interruzione per esaurimento della memoria. zram è l'opzione adatta alle schede SD.
- L'immagine arm64 è solo CPU; sulle schede ARM non c'è CUDA.

## Le manopole di regolazione {#tuning-knobs}

Tutti i limiti sono variabili d'ambiente, documentate per intero in [Configurazione](/it/guide/configuration). `0` significa illimitato o automatico. Quelle che contano su hardware piccolo:

| Variabile | Suggerimento per macchine piccole | Cosa protegge |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Quanti job girano in parallelo. Il rilevamento automatico usa i core della CPU meno uno, il che va bene su macchine grandi ed è troppo aggressivo su una macchina a 2 core sotto pressione di memoria. |
| `MAX_WORKER_THREADS` | `2` | Pool di thread per l'elaborazione delle immagini. |
| `MAX_BATCH_SIZE` | `5` | I batch sono il punto in cui le macchine da 1-2 GB esauriscono per prime la memoria. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Evita che un singolo file enorme occupi l'intero workspace. |
| `MAX_MEGAPIXELS` | `50` | Decodificare un'immagine da 100+ MP costa RAM indipendentemente dalla dimensione del file. |
| `MAX_VIDEO_DURATION_S` | `300` | Le transcodifiche lunghe monopolizzano una piccola CPU per minuti o ore. |
| `PROCESSING_TIMEOUT_S` | `600` | Tetto rigido, così un job fuori controllo libera prima o poi la macchina. |

Questi limiti si applicano a ciò che il server accetta, quindi li imposti in base a ciò che usa davvero e non al valore più basso possibile. Se non tocca mai i video, un limite `MAX_VIDEO_DURATION_S` non costa nulla; se scansiona documenti ogni giorno, non limiti `MAX_PDF_PAGES`.

## Cosa saltare {#what-to-skip}

- **I bundle AI pesanti.** Upscaling, ripristino foto e rimozione dello sfondo richiedono una GPU o una CPU many-core veloce, e ogni bundle costa 4-5 GB di disco. Su una macchina piccola, semplicemente non li installi; gli strumenti il cui bundle manca mostrano una richiesta di installazione invece di essere eseguiti.
- **La ricodifica video come carico di lavoro abituale.** Le transcodifiche occasionali vanno bene (sono solo lente); una coda costante di transcodifiche richiede core di CPU, non un Pi.
- **Gli strumenti inutilizzati in generale.** Un amministratore può disattivare singoli strumenti nelle Impostazioni, il che li rimuove dall'interfaccia e interrompe la registrazione delle loro route API. Questo da solo non risparmia memoria, ma impedisce che un'istanza piccola condivisa venga usata per l'unico carico di lavoro che l'hardware non regge.

Se in seguito sposta l'istanza su hardware più grande, rimuova i limiti (li riporti a `0`) e lo stesso volume dati si trasferisce.
