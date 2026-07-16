---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: 81cc593eda8d
---
# Configurazioni a basse risorse {#low-resource-setups}

SnapOtter funziona bene su hardware modesto: un Raspberry Pi 4 o 5, un vecchio laptop o un VPS da 2 GB. Questa pagina è la guida pratica per quelle macchine: cosa aspettarsi, una configurazione copia-incolla con limiti ragionevoli e quali funzionalità saltare. I dati completi dei benchmark dietro questi numeri si trovano in [Requisiti hardware](/it/guide/deployment#hardware-requirements).

Due vincoli rigidi da subito:

- **Solo a 64 bit.** L'immagine viene creata per `linux/amd64` e `linux/arm64`. ARM a 32 bit (`armv7`/`armhf`) non è supportato, quindi i Pi di prima generazione e la famiglia Pi Zero sono esclusi.
- **Soglia minima di memoria: 2 GB.** Con 512 MB lo stack non si avvia nemmeno, e 1 GB fallisce sui batch multi-file. 2 GB con 2 core è la configurazione più piccola che funziona comodamente.

## Cosa funziona bene su hardware modesto {#what-runs-well}

Ogni strumento non AI funziona su una macchina da 2 GB / 2 core: le intere sezioni Immagine e File, gli strumenti PDF e le operazioni video e audio in stream-copy (taglio, silenziamento, remux del container). La maggior parte termina in meno di un secondo.

Due carichi di lavoro fanno eccezione:

- **La ricodifica video** (conversione tra codec) è vincolata alla CPU. Una clip 1080p che richiede ~40 s su una CPU desktop veloce può richiedere diversi minuti su una CPU di classe Pi. Le operazioni in stream-copy restano istantanee.
- **Gli strumenti AI** hanno bisogno di RAM (4 GB consigliati) e di disco (i bundle più grandi pesano 4-5 GB ciascuno), e quelli pesanti (upscaling, ripristino foto, rimozione dello sfondo) non sono praticabili su CPU di classe Pi. L'AI leggera come il rilevamento dei volti e l'OCR è utilizzabile se hai la memoria necessaria.

Nessuno dei due è installato o in esecuzione finché non lo usi: senza bundle AI installati l'app a riposo occupa circa 360 MB, e i bundle AI vengono scaricati solo quando un amministratore li abilita.

## Guida passo passo per Raspberry Pi / vecchio laptop {#walkthrough}

Questa è l'installazione Compose standard di [Per iniziare](/it/guide/getting-started), più limiti di risorse e tetti prudenti. Presuppone un sistema operativo a 64 bit (su un Pi: Raspberry Pi OS 64-bit o Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
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
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Note per le macchine di classe Pi:

- **Preferisci un SSD USB a una scheda SD** per il volume dei dati e Postgres. Gli spazi di lavoro dei job fanno vero IO su disco, e le schede SD sono lente e si usurano in fretta.
- **Anche il container unico all-in-one funziona qui** (Postgres e Redis integrati quando `DATABASE_URL`/`REDIS_URL` non sono impostati), e su un host con poca memoria conviene abbassare il tetto del Redis integrato con `REDIS_MAXMEMORY` (vedi [Configurazione](/it/guide/configuration)). Compose offre un controllo più fine per singolo servizio, ed è per questo che questa guida lo usa.
- **Aggiungi swap sui dispositivi da 2 GB.** Evita che il picco occasionale (un PDF enorme, un batch che hai dimenticato di limitare) finisca in un out-of-memory kill. zram è l'opzione più delicata con le schede SD.
- L'immagine arm64 è solo CPU; non c'è CUDA sulle schede ARM.

## I parametri di regolazione {#tuning-knobs}

Tutti i tetti sono variabili d'ambiente, documentate per esteso in [Configurazione](/it/guide/configuration). `0` significa illimitato o automatico. Quelli che contano su hardware modesto:

| Variabile | Suggerimento per macchine piccole | Cosa protegge |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Quanti job girano in parallelo. Il rilevamento automatico usa i core della CPU meno uno, che va bene sulle macchine grandi ed è troppo aggressivo su una macchina a 2 core sotto pressione di memoria. |
| `MAX_WORKER_THREADS` | `2` | Pool di thread per l'elaborazione delle immagini. |
| `MAX_BATCH_SIZE` | `5` | I batch sono il punto in cui le macchine da 1-2 GB esauriscono la memoria per prime. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Impedisce che un singolo file enorme occupi l'intero spazio di lavoro. |
| `MAX_MEGAPIXELS` | `50` | Decodificare un'immagine da 100+ MP costa RAM a prescindere dalla dimensione del file. |
| `MAX_VIDEO_DURATION_S` | `300` | Le transcodifiche lunghe monopolizzano una CPU piccola per minuti o ore. |
| `PROCESSING_TIMEOUT_S` | `600` | Tetto rigido perché un job fuori controllo liberi comunque la macchina, prima o poi. |

Questi tetti si applicano a ciò che il server accetta, quindi impostali in base a ciò che usi davvero, non al minimo possibile. Se non tocchi mai i video, un tetto su `MAX_VIDEO_DURATION_S` non costa nulla; se digitalizzi documenti ogni giorno, non mettere un tetto a `MAX_PDF_PAGES`.

## Cosa saltare {#what-to-skip}

- **I bundle AI pesanti.** Upscaling, ripristino foto e rimozione dello sfondo vogliono una GPU o una CPU veloce con molti core, e ogni bundle costa 4-5 GB di disco. Su una macchina piccola, semplicemente non installarli; gli strumenti il cui bundle manca mostrano un invito all'installazione invece di essere eseguiti.
- **La ricodifica video come carico di lavoro abituale.** Le transcodifiche occasionali vanno bene (sono solo lente); una coda di transcodifica costante vuole core CPU, non un Pi.
- **Gli strumenti inutilizzati in generale.** Un amministratore può disattivare i singoli strumenti nelle Impostazioni, il che li rimuove dall'interfaccia e smette di registrare le loro rotte API. Di per sé non fa risparmiare memoria, ma evita che una piccola istanza condivisa venga usata proprio per l'unico carico di lavoro che l'hardware non può reggere.

Se in seguito sposti l'istanza su hardware più potente, rimuovi i tetti (riportali a `0`) e lo stesso volume dei dati si trasferisce così com'è.
