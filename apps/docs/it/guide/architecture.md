---
description: "Struttura del monorepo, architettura di app e pacchetti, ciclo di vita di una richiesta e impronta sulle risorse di SnapOtter."
i18n_source_hash: 9e8f80499a37
i18n_provenance: human
i18n_output_hash: 5a4f11a25575
---

# Architettura {#architecture}

SnapOtter è un monorepo gestito con i workspace pnpm e Turborepo. Viene distribuito come stack Docker Compose a 3 container: l'immagine dell'app SnapOtter, PostgreSQL 17 e Redis 8.

## Struttura del progetto {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## Pacchetti {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

La libreria core di elaborazione delle immagini costruita su [Sharp](https://sharp.pixelplumbing.com/). Gestisce tutte le operazioni non-AI: ridimensiona, ritaglia, ruota, capovolgi, converti, comprimi, rimuovi i metadati e regola i colori (luminosità, contrasto, saturazione, scala di grigi, seppia, inversione, canali di colore).

Questo pacchetto non ha dipendenze di rete e gira interamente in-process.

### `@snapotter/ai` {#snapotter-ai}

Uno strato bridge che chiama gli script Python per le operazioni ML. Al primo uso, il bridge avvia un processo dispatcher Python persistente che pre-importa le librerie pesanti (PIL, NumPy, MediaPipe, rembg) così che le chiamate AI successive saltino l'overhead di importazione. Se il dispatcher non è ancora pronto, il bridge ripiega sull'avvio di un nuovo sottoprocesso Python per ogni richiesta.

**I modelli non sono precaricati.** Ogni script dello strumento carica i pesi del proprio modello dal disco al momento della richiesta e li scarta quando la richiesta termina. Consulta [Impronta sulle risorse](#resource-footprint) per il profilo di memoria completo.

Operazioni supportate: rimozione dello sfondo (rembg/BiRefNet), upscaling (RealESRGAN), sfocatura dei volti (MediaPipe), miglioramento dei volti (GFPGAN/CodeFormer), cancellazione di oggetti (LaMa ONNX), OCR (PaddleOCR/Tesseract), colorazione (DDColor), rimozione del rumore, rimozione degli occhi rossi, restauro fotografico, generazione di foto tessera, correzione della trasparenza (matting HR di BiRefNet) e ridimensionamento content-aware (binario Go caire).

Gli script Python risiedono in `packages/ai/python/`. L'immagine Docker pre-scarica tutti i pesi dei modelli durante la build così che il container funzioni completamente offline.

### `@snapotter/shared` {#snapotter-shared}

Tipi TypeScript condivisi, costanti (come `APP_VERSION` e le definizioni degli strumenti) e stringhe di traduzione i18n usate sia dal frontend sia dal backend.

## Applicazioni {#applications}

### API (`apps/api`) {#api-apps-api}

Un server Fastify v5 che espone 241 route di strumenti su cinque modalità (immagine, video, audio, PDF, file) e gestisce:
- Upload di file, gestione dello spazio di lavoro temporaneo e archiviazione persistente dei file
- Libreria di file utente con catene di versioni (tabella `user_files`) - ogni risultato elaborato rimanda al file sorgente e registra quale strumento è stato applicato, con miniature auto-generate per la pagina File
- Esecuzione degli strumenti (instrada ogni richiesta di strumento all'image engine o all'AI bridge)
- Orchestrazione delle pipeline (concatenamento sequenziale di più strumenti)
- Elaborazione in batch con controllo della concorrenza tramite le code di lavori BullMQ (pool: image, media, ai, docs, system)
- Autenticazione utente, RBAC (ruoli admin/user con un set completo di permessi), gestione delle chiavi API e rate limiting
- Gestione dei team - CRUD solo per admin; gli utenti vengono assegnati a un team tramite il campo `team` sul loro profilo
- Impostazioni di runtime - un archivio chiave-valore nella tabella `settings` che controlla `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit` e altre manopole operative senza ridistribuire
- Branding personalizzato e preferenze di runtime tramite impostazioni supportate dal database
- Documentazione Scalar/OpenAPI su `/api/docs`
- Servire il frontend compilato come SPA in produzione

Dipendenze principali: Fastify, Drizzle ORM (pg-core, node-postgres), Sharp, BullMQ, ioredis, Zod per la validazione.

Il server gestisce lo spegnimento controllato su SIGTERM/SIGINT: drena le connessioni HTTP, ferma i worker BullMQ, spegne il dispatcher Python e chiude la connessione al database.

### Web (`apps/web`) {#web-apps-web}

Una single-page app React 19 costruita con Vite. Usa Zustand per la gestione dello stato, Tailwind CSS v4 per lo stile e Lucide per le icone. Comunica con l'API tramite REST e SSE (per il tracciamento dell'avanzamento).

Le pagine includono uno spazio di lavoro per gli strumenti, una pagina File per gestire upload e risultati persistenti, un costruttore di automazione/pipeline e un pannello di impostazioni admin.

Il frontend compilato viene servito dal backend Fastify in produzione, quindi non c'è un server web separato nel container Docker.

### Docs (`apps/docs`) {#docs-apps-docs}

Questo sito VitePress. Distribuito su Cloudflare Pages automaticamente al push su `main`.

## Come scorre una richiesta {#how-a-request-flows}

1. L'utente sceglie uno strumento nell'interfaccia web e carica un file.
2. Il frontend invia un POST multipart a `/api/v1/tools/:section/:toolId` con il file e le impostazioni.
3. La route API valida l'input con Zod, poi avvia l'elaborazione.
4. Per gli strumenti standard, il lavoro viene accodato al pool BullMQ appropriato (image, media o docs in base alla modalità). Il worker BullMQ in-process orienta automaticamente l'immagine in base ai metadati EXIF, esegue la funzione di elaborazione dello strumento e restituisce il risultato.
5. Per gli strumenti AI, il bridge TypeScript invia una richiesta al dispatcher Python persistente (o avvia un nuovo sottoprocesso come fallback), attende che finisca e legge il file di output.
6. L'avanzamento del lavoro viene persistito nella tabella `jobs` in PostgreSQL così che lo stato sopravviva ai riavvii del container. Gli aggiornamenti in tempo reale vengono consegnati via SSE su `/api/v1/jobs/:jobId/progress`.
7. L'API restituisce un `jobId` e un `downloadUrl`. L'utente scarica il file elaborato da `/api/v1/download/:jobId/:filename`.

Per le pipeline, l'API passa l'output di ogni passaggio come input al successivo, eseguendoli in sequenza.

Per l'elaborazione in batch, l'API usa i flow BullMQ con lavori figlio per ogni passaggio e restituisce un file ZIP con tutti i file elaborati.

## Impronta sulle risorse {#resource-footprint}

SnapOtter è progettato per un basso utilizzo di memoria a riposo. Nulla viene precaricato o tenuto caldo all'avvio.

### A riposo {#at-idle}

Il processo Node.js/Fastify, PostgreSQL e Redis sono in esecuzione. La RAM tipica a riposo è di **~200-300 MB** tra tutti e tre i container (processo Node.js, Postgres e Redis). Nessun processo Python, nessun peso di modello in memoria.

### Cosa si avvia, e quando {#what-starts-and-when}

| Componente | Si avvia quando | Memoria mentre è attivo |
|-----------|-------------|---------------------|
| Server Fastify + Postgres + Redis | Avvio del container | ~200-300 MB in totale |
| Worker BullMQ | Avvio del container (in-process) | Un worker per pool (image, media, ai, docs, system) |
| Dispatcher Python | Prima richiesta di uno strumento AI | Interprete Python + librerie pre-importate (PIL, NumPy, MediaPipe, rembg) - nessun peso di modello |
| Pesi dei modelli AI | Durante la richiesta dello specifico strumento | Caricati dal disco, liberati al termine della richiesta |

### Caricamento dei modelli {#model-loading}

Tutti i file dei pesi dei modelli (per un totale di diversi GB) risiedono sul disco in `/opt/models/` in ogni momento. Ogni script dello strumento AI carica in memoria solo il proprio modello o i propri modelli per la durata di una richiesta, poi li rilascia. Alcuni script chiamano esplicitamente `del model` e `torch.cuda.empty_cache()` dopo l'inferenza per assicurarsi che la memoria venga restituita immediatamente.

Non esiste una cache dei modelli tra le richieste. Eseguire lo stesso strumento AI in successione ricarica il modello ogni volta. Questo mantiene la memoria a riposo prossima allo zero al costo di un ritardo di caricamento del modello a ogni richiesta AI.

### Cold start della prima richiesta AI {#first-ai-request-cold-start}

Il dispatcher Python non è in esecuzione all'avvio del container. La prima richiesta AI innesca due cose in parallelo: il dispatcher inizia a scaldarsi in background e la richiesta stessa ripiega sull'avvio una tantum di un sottoprocesso Python. Una volta che il dispatcher segnala di essere pronto, tutte le richieste AI successive lo usano direttamente e saltano il costo di avvio del sottoprocesso.
