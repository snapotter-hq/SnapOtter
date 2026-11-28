---
description: "Tutte le variabili d'ambiente di SnapOtter con i valori predefiniti. Configuri autenticazione, storage, modelli AI, analytics e altro."
i18n_source_hash: 0a7a78fd254c
i18n_provenance: machine
i18n_output_hash: 6ef9f75f1148
i18n_hash_version: 2
---

# Configurazione {#configuration}

Tutta la configurazione avviene tramite variabili d'ambiente. Ogni variabile ha un valore predefinito sensato, quindi SnapOtter funziona subito senza impostarne alcuna.

## Variabili d'ambiente {#environment-variables}

### Server {#server}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `PORT` | `1349` | Porta su cui il server è in ascolto. |
| `HOST` | `0.0.0.0` | Indirizzo IP su cui il server è in ascolto. Su una rete bridge (il valore predefinito per `docker run` e Compose) mantenga `0.0.0.0` (o `::`), altrimenti le porte pubblicate smettono di funzionare. In un'installazione nativa o con un container sulla rete host, `127.0.0.1` tiene l'API fuori dalla rete; per l'accesso remoto, anteponga un reverse proxy. La [modalità embedded](#embedded-mode) funziona solo con `0.0.0.0`, `::` o `127.0.0.1`, perché il suo controllo di avvio chiama `127.0.0.1`. Con qualsiasi altro indirizzo, `::1` compreso, il container non risulta mai avviato, e un crash successivo lo ferma invece di riavviare il server. Qualsiasi valore che non sia un indirizzo IP, `localhost` compreso, arresta il server all'avvio. |
| `BASE_PATH` | (vuoto) | Percorso pubblico di deployment, ad es. `/snapotter`. Se vuoto o `/`, il servizio risponde alla radice del dominio. Applicato a runtime; non è necessario ricostruire l'immagine. |
| `RATE_LIMIT_PER_MIN` | `1000` | Numero massimo di richieste al minuto per IP. Imposti 0 per disattivare il rate limiting. |
| `API_KEYS_RATE_LIMIT_PER_MIN` | `30` | Numero massimo di richieste al minuto per IP agli endpoint di gestione delle chiavi API (elenco, creazione, revoca). Le chiavi in uso per le chiamate agli strumenti non sono interessate. Imposti `0` per nessun limite. |
| `CORS_ORIGIN` | (vuoto) | Origini consentite per CORS, separate da virgole, oppure vuoto per consentire solo la stessa origine. |
| `LOG_LEVEL` | `info` | Livello di dettaglio dei log. Uno tra: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Quali peer possono impostare l'IP del client tramite `X-Forwarded-For`. Il valore predefinito si fida solo di un peer su rete privata, quindi un reverse proxy su una rete Docker o su una LAN è considerato attendibile, mentre l'header falsificato di un client pubblico no. Imposti `true` solo quando un proxy sotto il Suo controllo si trova davanti a un indirizzo pubblico. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | `on` | Imposta `off` per avviare una nuova istanza con "Analisi di prodotto anonime" disattivata, così non invia nulla fin dal primo avvio. La variabile fornisce il valore dell'impostazione solo finché nessuno ne ha scelto uno. Una volta salvata l'impostazione, da un amministratore o da questa variabile, modificare la variabile non ha alcun effetto; un amministratore può comunque attivare le analytics in Impostazioni > Sistema > Privacy. |

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
| `LOGIN_ATTEMPT_LIMIT` | `30` | Numero massimo di richieste di login al minuto per IP. I tentativi successivi ricevono un `429` fino alla fine del minuto. Gli errori ripetuti per un singolo nome utente di solito raggiungono prima `LOGIN_THROTTLE_MAX_FAILURES`. Un amministratore può sostituirlo in Impostazioni > Sistema. Imposti `0` per nessun limite. Una build da sorgente parte da 10. |
| `LOGIN_THROTTLE_MAX_FAILURES` | `10` | Numero di login con password falliti che un singolo nome utente può avere entro `LOGIN_THROTTLE_WINDOW_S` prima che i tentativi successivi ricevano un `429`, da qualunque IP provengano. Vengono riammessi man mano che i fallimenti più vecchi escono dalla finestra. Imposti 0 per disattivare la limitazione. |
| `LOGIN_THROTTLE_WINDOW_S` | `900` | Durata di quella finestra, in secondi. Deve essere almeno 1; il server si rifiuta di avviarsi con 0. |

### Storage {#storage}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` oppure `s3`. S3 e MinIO richiedono una licenza con la funzione s3_storage e le variabili `S3_*` riportate più avanti. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | Stringa di connessione a PostgreSQL e connessione su cui viene servita ogni richiesta. Dalla versione 2.3.0 in poi, impostando anche `DATABASE_MIGRATION_URL` diventa il ruolo di runtime a privilegi minimi, con DML sulle tabelle dell'app e nient'altro. Lo stack Compose la punta al proprio servizio `postgres`; la lasci non impostata (insieme a `REDIS_URL`) per ottenere la modalità embedded. Per connettersi tramite un socket unix, indichi la directory del socket in `host`, come in `postgres://user:pass@localhost/snapotter?host=/var/run/postgresql`, e monti quella directory nel container. |
| `DATABASE_MIGRATION_URL` | (vuoto) | Connessione privilegiata, usata solo durante l'avvio per eseguire le migrazioni e concedere i privilegi al ruolo di runtime, poi chiusa prima della prima richiesta. Se la lascia vuota, SnapOtter funziona con un solo ruolo, e `DATABASE_URL` svolge entrambi i compiti. Vedere [Ruoli a privilegi minimi](/it/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Stringa di connessione a Redis (usata per le code di job BullMQ). Compose la punta al proprio servizio `redis`. Per un socket unix, usi `unix:///run/redis/redis.sock?db=5` (aggiunga `&password=...` se Redis ne richiede una) e monti il socket nel container. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Directory per i file temporanei durante l'elaborazione. Ripulita automaticamente. L'immagine imposta `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Directory per i file utente persistenti (immagini caricate, risultati salvati). L'immagine imposta `/data/files`. |
| `MAX_STORAGE_PER_USER_MB` | `5000` | Limite in megabyte per ciò che ogni utente conserva nella libreria File. Un salvataggio che lo supererebbe viene rifiutato indicando lo spazio usato e il limite. Una quota impostata sull'utente lo sostituisce. Imposti 0 per nessun limite. |

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
| `EMBEDDED_PG_PORT` | `5432` | Porta di loopback per il PostgreSQL embedded (solo in modalità embedded). La modifichi solo quando il container condivide una rete in cui la porta 5432 è già occupata, come con `--network host`. Deve essere diversa da `EMBEDDED_REDIS_PORT` e superiore a 1023, perché PostgreSQL viene eseguito come utente non privilegiato, che non può associarsi a una porta privilegiata sulla rete host. |
| `EMBEDDED_REDIS_PORT` | `6379` | Lo stesso, per il Redis embedded, che viene anch'esso eseguito come utente non privilegiato. |
| `EMBEDDED_DB_PASSWORDS` | (vuoto) | Imposti `1` per generare al prossimo avvio password casuali per i ruoli del PostgreSQL embedded e per Redis, conservate in `/data/.embedded-db-secrets`. Da quel momento i login via TCP le richiedono. Su un volume creato per la prima volta dalla 2.3.0 o successive, il superuser di PostgreSQL non può accedere affatto via TCP; su un volume più vecchio il proprietario del database è il superuser, ed è la sua password a proteggerlo. La usi ogni volta che altri programmi condividono la rete del container, ad esempio con `--network host`. Resta attiva per quel volume: le password vengono usate a ogni avvio anche se rimuove questa variabile, ed eliminare `/data/.embedded-db-secrets` Le fa ottenere solo password nuove, oppure un avvio che fallisce se la variabile non è impostata. Se il container non si avvia perché uno di quei file è danneggiato, elimini quel file con `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` e avvii di nuovo il container; l'avvio successivo ne crea uno nuovo. La variabile accetta `1`, `0` o vuoto, e qualsiasi altro valore interrompe l'avvio. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Secondi di attesa dell'avvio perché il Redis embedded risponda a `PING` prima di rinunciare. Allo scadere il container si ferma e ne registra il motivo, invece di bloccarsi. Secondi interi da 1 a 999999; non esiste un valore illimitato, perché attendere all'infinito è proprio il guasto che questo limite serve a evitare. Lo aumenti solo se un host lento lo fa scattare. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Lo stesso, per il PostgreSQL embedded. Il conteggio parte dopo il termine di `initdb` al primo avvio, quindi copre l'avvio del server e il crash recovery, non la creazione iniziale del database. |

Aggiornamento dalla 1.x: collochi il Suo vecchio `snapotter.db` in `/data/snapotter.db` nel volume e la modalità embedded lo importa nel PostgreSQL embedded al primo avvio. L'importazione viene eseguita una sola volta; gli avvii successivi la saltano.

Nota sulla telemetria: la modalità embedded eredita l'impostazione predefinita di analytics dell'immagine, come qualsiasi altra configurazione. L'immagine pubblicata include le analytics attive; per disattivarle, compili con `--build-arg SNAPOTTER_ANALYTICS=off`, imposti `SNAPOTTER_ANALYTICS_DEFAULT=off` prima del primo avvio, oppure usi l'opt-out dell'amministratore nell'app.

### Limiti di elaborazione {#processing-limits}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (illimitato) | Dimensione massima del file per upload in megabyte. Imposti 0 per nessun limite. L'immagine pubblicata include `0`; una build da sorgente parte da 100. |
| `MAX_BATCH_SIZE` | `0` (illimitato) | Numero massimo di file in una singola richiesta batch. Imposti 0 per nessun limite. L'immagine pubblicata include `0`; una build da sorgente parte da 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Numero di job batch eseguiti in parallelo. Imposti 0 per il rilevamento automatico in base ai core CPU disponibili. |
| `MAX_MEGAPIXELS` | `0` (nessun limite dell'app) | Risoluzione massima consentita per le immagini, in megapixel. Imposti 0 per rimuovere il limite proprio di SnapOtter. Il decoder delle immagini rifiuta comunque qualsiasi immagine oltre circa 268 MP (16383 x 16383 pixel), quindi un valore superiore a 268 non ha alcun effetto aggiuntivo. |
| `MAX_CPU_UPSCALE_MP` | `4` | Input più grande, in megapixel, che l'upscaling AI accetta su un host senza GPU. L'output ingrandito è inoltre limitato a 16 volte questo valore (64 MP per impostazione predefinita), quindi un fattore di scala alto riduce ulteriormente il limite di input. Un'immagine più grande viene ridotta per rientrare prima dell'upscaling; se ciò lasciasse il risultato non più grande dell'originale, la richiesta viene invece rifiutata. Lanczos salta il limite di input ma non quello di output. Imposti 0 per nessun limite, che richiede molta RAM: RealESRGAN costruisce sempre internamente un buffer 4x. |
| `MAX_WORKSPACE_SIZE_GB` | `0` (illimitato) | Limite in GB sulla dimensione complessiva di upload e risultati memorizzati nel workspace. Una volta superato, upload e richieste agli strumenti ricevono un 503 finché i file non scadono dopo `FILE_MAX_AGE_HOURS`. Imposti 0 per nessun limite; l'archiviazione locale rifiuta comunque le scritture con un 503 quando il disco ha meno di 0,5 GB liberi. L'immagine pubblicata include `0`; una build da sorgente parte da 10. |
| `MAX_WORKER_THREADS` | `0` (auto) | Numero massimo di worker thread per l'elaborazione delle immagini. Imposti 0 per il rilevamento automatico in base ai core CPU disponibili. |
| `PROCESSING_TIMEOUT_S` | `0` (nessun limite) | Timeout per ogni chiamata al sidecar Python che esegue gli strumenti AI, in secondi. Imposti 0 per nessun limite. Non limita i job di immagini, PDF o media; questo è compito di `JOB_TIMEOUT_FAST_S` e `JOB_TIMEOUT_LONG_S`. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Secondi di inattività del sidecar AI Python e del runtime OCR accurato prima che terminino e liberino la loro memoria (circa 1,3 GB e 0,7 GB una volta a regime). Entrambi ripartono alla richiesta successiva, quindi la prima chiamata AI dopo un'uscita per inattività paga il costo di avvio delle librerie, qualche secondo. Imposti 0 per mantenerli in esecuzione. Il valore predefinito corrisponde a `AI_SESSION_IDLE_TIMEOUT`, così i modelli caricati non vengono scaricati prima di quanto indichi quell'impostazione. Se aumenta `AI_SESSION_IDLE_TIMEOUT`, aumenti di conseguenza anche questo valore. |
| `AI_SESSION_IDLE_TIMEOUT` | `0` (auto) | Secondi per cui un modello AI caricato resta in cache nel sidecar dopo l'ultimo utilizzo. Auto è 600. Letto dal sidecar Python, che scarta anche tutti i modelli in cache quando termina dopo `AI_SIDECAR_IDLE_TIMEOUT`. |
| `AI_SESSION_CACHE_BYTES` | `0` (auto) | Budget di memoria per i modelli AI in cache, in byte. Auto è il 40% della memoria della GPU, e nessuna cache su un host solo CPU. Lo imposti su un host CPU per mettere in cache i modelli in RAM; lo imposti a 1 per disattivare la cache su un host GPU. Letto dal sidecar Python. |
| `MAX_AI_JOBS_PER_USER` | `5` | Job AI su singolo file che un utente può avere in coda o in esecuzione contemporaneamente. Quelli in più ricevono un `429` finché uno non termina. Il pool AI esegue un job alla volta, quindi questo impedisce a un utente di occuparlo. Le esecuzioni AI in batch e pipeline non contano. Imposti 0 per nessun limite. |
| `JOB_TIMEOUT_FAST_S` | `120` | Scadenza per un singolo job sui pool veloci (strumenti per immagini e documenti), in secondi. Un job che dura di più fallisce con un errore di timeout. Imposti 0 per nessun limite. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Scadenza per un singolo job sui pool lunghi (strumenti AI e media, più qualsiasi strumento contrassegnato come di lunga durata), in secondi. Imposti 0 per nessun limite. L'OCR PDF Balanced e Best estende la propria scadenza in base al numero di pagine (2 e 5 minuti a pagina), fino a 6 ore, quindi per un PDF di grandi dimensioni non serve aumentare questo valore. |
| `SYNC_WAIT_MS` | `8000` | Per quanto tempo una richiesta a uno strumento attende il proprio job prima che l'API smetta di attendere e restituisca `202` con un ID del job da seguire tramite SSE, in millisecondi. Non interrompe il job. Imposti 0 per attendere il job per tutto il tempo necessario. |
| `MAX_PIPELINE_STEPS` | `20` | Numero massimo di passaggi in una pipeline. Imposti 0 per nessun limite. |
| `MAX_PIPELINE_STEP_PIXELS` | `67108864` | Output più grande che un passaggio della pipeline può richiedere, come larghezza per altezza in pixel (il valore predefinito è 8192 x 8192). Un passaggio le cui impostazioni ne richiedono di più viene rifiutato prima dell'esecuzione della pipeline. Imposti 0 per nessun limite. |
| `MAX_CANVAS_PIXELS` | `0` (nessun limite) | Dimensione massima del canvas in pixel per le immagini in output. Imposti 0 per nessun limite. |
| `MAX_SVG_SIZE_MB` | `50` | SVG più grande accettato prima della sanitizzazione, in megabyte. `0` qui si comporta diversamente dalle righe vicine: elimina del tutto il limite di dimensione prima del parsing invece di alzarlo, quindi lasci questa variabile impostata. |
| `MAX_PDF_PAGES` | `0` (illimitato) | Numero massimo di pagine PDF per la conversione da PDF a immagine. Imposti 0 per nessun limite. |
| `MAX_VIDEO_DURATION_S` | `0` (illimitato) | Video più lungo che gli strumenti video accettano, in secondi. I file più lunghi vengono rifiutati prima dell'elaborazione, con la durata e il limite nell'errore. Imposti 0 per nessun limite. |
| `MAX_AUDIO_DURATION_S` | `0` (illimitato) | Lo stesso, per gli strumenti audio. |
| `MAX_VIDEO_BITRATE_KBPS` | `0` (illimitato) | Bitrate complessivo più alto che gli strumenti video accettano, in kilobit al secondo. Imposti 0 per nessun limite. |
| `PREVIEW_TIMEOUT_S` | `300` | Limite di tempo per la codifica di una clip di anteprima nel browser di un file video o audio, in secondi. Le anteprime dei documenti usano invece `LIBREOFFICE_TIMEOUT_S`. Imposti 0 per nessun limite. |
| `LIBREOFFICE_TIMEOUT_S` | `120` | Limite di tempo per una conversione LibreOffice (Word, Excel e PowerPoint in PDF, i convertitori di documenti e le anteprime dei documenti), in secondi. Imposti `0` per nessun limite. |
| `GIF_BG_MAX_FRAMES` | `150` | Numero massimo di frame che Remove GIF Background accetta in un'unica animazione. Le animazioni più lunghe ricevono un `400` che indica il numero di frame. Imposti 0 per nessun limite di frame; si applica comunque un budget di pixel separato. |
| `SUBPROCESS_MEMORY_LIMIT_MB` | `0` (disattivato) | Limite di spazio di indirizzamento, in megabyte, per ciascuno di questi processi ausiliari: ffmpeg, ffprobe, Ghostscript, qpdf, LibreOffice, pandoc e pdfcpu nei motori multimediale e documenti, più, per le immagini, exiftool, i decoder e gli encoder HEIF, JPEG XL e JPEG 2000, il decoder RAW e il decoder di ripiego ffmpeg. ImageMagick non ha limite, perché dispone di propri limiti di memoria, e nemmeno il sidecar AI. Un processo che supera il limite viene terminato invece di spingere l'intero container nell'out-of-memory killer. Limita la memoria virtuale, non quella residente, quindi lo imposti molto al di sopra di ciò che un processo usa realmente. L'encoder JPEG XL è il più esigente: un'immagine da 24 MP ha richiesto circa 1,8 GB ed è fallita con 1 GB, e più thread o CPU non cambiano molto la situazione. Finché il limite è impostato, l'encoder HEIF è limitato a due worker thread, il che porta una codifica da 24 MP a circa 0,8 GB al costo di una codifica più lenta. Parta da `2048` e lo riduca solo dopo aver provato i Suoi file più grandi. Imposti 0 per disattivarlo e affidarsi al limite di memoria del container. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Dimensione massima del campo `settings` che una richiesta a uno strumento può contenere, in kilobyte, calcolata in byte UTF-8. Le richieste oltre il limite ricevono un `400`. Imposti 0 per nessun limite. Le impostazioni reali degli strumenti sono molto più piccole di 64 KB, quindi aumenti questo valore solo se un client invia impostazioni insolitamente grandi. |
| `MAX_SUBTITLE_SIZE_MB` | `1` | File di sottotitoli più grande (`.srt`, `.vtt`, `.ass`) che Burn Subtitles ed Embed Subtitles accettano, in megabyte. I file più grandi ricevono un `400` che indica la dimensione del file e il limite. Imposti 0 per nessun limite. Un file di sottotitoli per un lungometraggio è di solito ben sotto 1 MB. |
| `MAX_METADATA_TAG_LENGTH` | `10000` | Valore più lungo che Edit Metadata scrive in un singolo tag (artista, descrizione, parole chiave e così via), in caratteri. I valori più lunghi ricevono un `400` che indica il tag e il limite. Imposti 0 per nessun limite. Lo aumenti se conserva didascalie o descrizioni lunghe. Il valore di un tag deve inoltre rientrare in `MAX_SETTINGS_PAYLOAD_KB` e nel limite per argomento del sistema operativo (128 KB su Linux). |

### Strumenti IA {#ai-tools}

Vengono lette dal sidecar Python. Impostale nell'ambiente del container (o in `.env` per i file Compose pubblicati) e riavvia.

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `SNAPOTTER_GPU` | (vuoto) | Impostala su `0`, `false` o `no` per tenere tutti gli strumenti IA sulla CPU anche quando è presente una GPU. Qualsiasi altro valore, o lasciarla vuota, permette a SnapOtter di usare la GPU rilevata. Usala quando una GPU piccola esaurisce la memoria a metà di un lavoro, o quando un problema del driver fa fallire le esecuzioni su GPU. Conta soprattutto nelle installazioni native e LXC, che ora usano la GPU quando è presente la wheel pip di cuDNN. Le esecuzioni su CPU sono più lente, e `MAX_CPU_UPSCALE_MP` si applica all'upscaling. |
| `SD15_INPAINT_DIR` | `$MODELS_PATH/sd15-inpainting` | Cartella che contiene il modello di inpainting Stable Diffusion 1.5 (formato diffusers) usato da Cancella oggetti nella modalità ad alta qualità. Il bundle di funzionalità `inpaint-hq` lo colloca qui, quindi cambiala solo se tieni il modello altrove. `MODELS_PATH` è impostata da SnapOtter su `ai/models` nella directory dei dati. |
| `SD15_INPAINT_STEPS` | `28` | Passi di riduzione del rumore per cancellazione. Più passi possono aggiungere dettaglio e richiedono proporzionalmente più tempo. |
| `SD15_INPAINT_STRENGTH` | `0.95` | Quanto il modello può ridipingere l'area mascherata, da 0 a 1. Valori bassi mantengono più pixel originali (l'area viene prima riempita a partire dall'intorno, poi rifinita leggermente). Valori alti lasciano il modello ridipingere più liberamente, e `1` ignora l'intorno e dipinge dal rumore, con più probabilità di inventare un nuovo oggetto. |
| `SD15_INPAINT_GUIDANCE` | `7.0` | Con quanta forza il modello segue i prompt. Valori più alti li seguono più alla lettera; valori molto alti possono apparire duri. |
| `SD15_INPAINT_PROMPT` | (vuoto) | Testo che descrive cosa dipingere nell'area cancellata. Vuoto funziona meglio per la rimozione, perché il modello continua l'intorno. |
| `SD15_INPAINT_NEGATIVE` | `object, person, text, watermark, artifact, blurry, distorted, extra limbs` | Testo che descrive cosa tenere fuori dall'area cancellata. Il valore predefinito evita di dipingere un nuovo oggetto nel vuoto. |
| `SD15_INPAINT_SEED` | `0` | Seed casuale. Un seed fisso fa cancellare nello stesso modo la stessa immagine con la stessa maschera ogni volta. Cambialo per ottenere un risultato diverso. |

### Motori {#engines}

SnapOtter cerca ogni binario di elaborazione in `$PATH` all'interno del container, quindi queste variabili restano vuote a meno che non monti una Sua build.

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `FFMPEG_PATH` | (vuoto) | Percorso del binario `ffmpeg` alla base degli strumenti video e audio. |
| `FFPROBE_PATH` | (vuoto) | Percorso di `ffprobe`, che legge i file multimediali prima dell'elaborazione. Lo punti alla stessa build di `FFMPEG_PATH`. |
| `QPDF_PATH` | (vuoto) | Percorso di `qpdf`, usato dagli strumenti PDF e per controllare i PDF caricati. |
| `SOFFICE_PATH` | (vuoto) | Percorso di `soffice` di LibreOffice, usato per le conversioni di documenti office. |
| `PDFCPU_PATH` | (vuoto) | Percorso di `pdfcpu`, usato da alcuni strumenti PDF. |
| `GS_PATH` | (vuoto) | Percorso di `gs` di Ghostscript, usato dagli strumenti PDF e dall'OCR dei PDF. |
| `PANDOC_PATH` | (vuoto) | Percorso di `pandoc`, usato dalle conversioni di documenti. |
| `SNAPOTTER_FONT_FILE` | (vuoto) | File di font per il testo disegnato sul video (sottotitoli impressi, filigrana video). Se vuoto, si usa il primo font trovato dall'immagine. |
| `SNAPOTTER_FONT_FAMILY` | (vuoto) | Nome della famiglia di `SNAPOTTER_FONT_FILE`. Se vuoto, si usa `Sans`. |
| `SNAPOTTER_HW_ACCEL` | (vuoto) | Famiglia di encoder video hardware, `nvenc` oppure `vaapi`. Se vuoto, la codifica avviene via software. |

`SNAPOTTER_HW_ACCEL` richiede un ffmpeg compilato con quella famiglia di encoder, e l'ffmpeg incluso nell'immagine non ne ha nessuna. Con il binario dell'immagine l'impostazione ricade sulla codifica software e lo segnala nel log di avvio. Per usarla, monti una Sua build di ffmpeg, punti `FFMPEG_PATH` e `FFPROBE_PATH` a essa e assegni al container il dispositivo GPU. Per `nvenc` imposti anche `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: l'immagine richiede solo `compute,utility`, e senza `video` il runtime NVIDIA non monta la libreria di codifica, quindi l'encoder risulta elencato ma ogni codifica fallisce. Anche un override di percorso inesistente o non eseguibile viene segnalato nel log di avvio, e ogni job che richiede quel binario fallisce finché non corregge il percorso o lo rimuove.

I file Compose pubblicati passano tutte queste variabili da `.env`, quindi è sufficiente impostarle lì.

### Pulizia {#cleanup}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Per quanto tempo i risultati di elaborazione non salvati (upload grezzi e output degli strumenti) vengono conservati prima dell'eliminazione automatica. I file che salva esplicitamente nella libreria File non sono interessati e restano finché non li elimina. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Frequenza di esecuzione del job di pulizia. |
| `JOBS_RETENTION_DAYS` | `30` | Giorni per cui un record di job terminato (completato, fallito o annullato) viene conservato prima che la pulizia di conservazione, eseguita ogni 6 ore, lo elimini. Un amministratore può sostituirlo in Impostazioni > Sistema. Utenti e team con blocco legale conservano i propri. Imposti 0 per conservarli per sempre. |
| `AUDIT_RETENTION_DAYS` | `0` (per sempre) | Giorni per cui le voci del registro di audit vengono conservate. Stesse regole di sostituzione e blocco legale. Non viene eliminato nulla finché è attivo il registro di audit a prova di manomissione. Imposti 0 per conservarle per sempre. |

### Licenza Enterprise {#enterprise-license}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `SNAPOTTER_LICENSE_KEY` | (vuoto) | Chiave di licenza che sblocca le funzionalità enterprise, come SAML, SCIM e l'archiviazione S3. Letta all'avvio, quindi riavvii dopo averla modificata. Una chiave non valida o scaduta registra un avviso e il server funziona senza di esse. Nel container può invece montarla, tramite `SNAPOTTER_LICENSE_KEY_FILE` (vedere [Docker secrets](/it/guide/security#docker-secrets)). |

### Aspetto {#appearance}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `DEFAULT_THEME` | `light` | Tema predefinito per le nuove sessioni. `light`, `dark` oppure `system`. |
| `DEFAULT_LOCALE` | `en` | Lingua predefinita dell'interfaccia. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Layout predefinito degli strumenti. `sidebar` oppure `fullscreen`. |

### Permessi Docker {#docker-permissions}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `PUID` | `999` | Esegue il processo del container con questo UID. Lo faccia corrispondere al Suo utente host per i bind mount (`id -u`). Richiede un filesystem root scrivibile; vedere la [guida alla sicurezza](/it/guide/security#why-read-only-is-not-set). |
| `PGID` | `999` | Esegue il processo del container con questo GID. Lo faccia corrispondere al Suo gruppo host per i bind mount (`id -g`). Richiede un filesystem root scrivibile; vedere la [guida alla sicurezza](/it/guide/security#why-read-only-is-not-set). |

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
