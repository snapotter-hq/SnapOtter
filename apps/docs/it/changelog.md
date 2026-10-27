---
description: "Note di rilascio e cronologia delle versioni di SnapOtter. Scopri le novità, i miglioramenti e le correzioni di ogni release."
i18n_source_hash: d3c5fc4c6b75
i18n_provenance: human
i18n_output_hash: a43453cc7cf2
---

# Changelog {#changelog}

## v2.2.0 {#v2-2-0}

La maggior parte della 2.2 riguarda il rafforzamento della sicurezza. Un utente non amministratore con un ruolo delegato `users:manage` poteva prendere il controllo di un'istanza, e ogni endpoint degli strumenti risultava privo del controllo dei permessi. Aggiorna se hai più di un utente.

Il resto è la lunga coda dell'auto-hosting: download che partivano e non finivano mai, preset che si rompevano nel momento in cui aggiungevi un secondo file, container che entravano in un ciclo di riavvii mentre Postgres stava ancora avviandosi. Sono arrivati anche due nuovi strumenti. La documentazione e il sito web sono ora tradotti in 21 lingue, e l'interfaccia supera finalmente i requisiti di contrasto WCAG AA.

> [!IMPORTANT]
> Se hai concesso `users:manage` a un non amministratore tramite un ruolo personalizzato, quel ruolo poteva assumere il controllo degli account amministratore nelle versioni dalla 2.0.0 alla 2.1.0. Dettagli in Sicurezza.

### Sicurezza {#v2-2-0-security}

- **Escalation di privilegi tramite un ruolo delegato `users:manage` (GHSA-9xgh-95qh-2x7h).** Un non amministratore con `users:manage` tramite un ruolo personalizzato poteva reimpostare la password o eliminare un account con privilegi superiori, compreso un amministratore predefinito, e assumere il controllo dell'istanza. La reimpostazione della password e l'eliminazione dell'account ora verificano l'autorità del chiamante sul destinatario, quindi un ruolo delegato non può agire al di sopra del proprio livello. Versioni interessate: dalla 2.0.0 alla 2.1.0. Segnalato da 李春来 (Chunlai Li). (#616)
- **Ogni endpoint degli strumenti è ora protetto.** L'accesso agli strumenti era applicato route per route, quindi tutte le 45 route scritte a mano dovevano ricordare la stessa chiamata e nessuna lo faceva. Un ruolo senza `tools:use` poteva comunque eseguire image-to-pdf, erase-object, upscale, sign-pdf e gli altri. Il controllo ora risiede in un unico preHandler basato sulla route corrispondente, quindi copre i sottopercorsi e qualsiasi route aggiunta in seguito. (#646)
- **Il rate limiting era aggirabile nelle installazioni Docker.** L'immagine includeva `TRUST_PROXY=true`, quindi l'IP del client proveniva da un'intestazione della richiesta e un `X-Forwarded-For` falsificato superava il limitatore di accesso. Il valore predefinito è ora una lista di reti private considerate attendibili. (#649)
- **Le scritture delle impostazioni vengono verificate per singola impostazione**, non una sola volta all'ingresso, e l'importazione della configurazione è ora transazionale, così una chiave rifiutata non può lasciare una configurazione applicata a metà. (#618)
- **I nomi dei file della libreria non possono uscire dalla loro radice di archiviazione.** Un nome memorizzato appositamente costruito, che un'importazione SQLite 1.x malevola copia alla lettera, poteva leggere o eliminare file fuori dalla directory dei file. Raggiungibile solo dopo che un operatore importa un database SQLite 1.x fornito da un attaccante, l'unico percorso che consente di scegliere un nome memorizzato. Segnalato da @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **L'annullamento dei lavori verifica la proprietà**, quindi un utente autenticato non può più annullare il lavoro di un altro utente tramite il suo id. Segnalato da @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Un nuovo audit dell'intera base di codice 2.0 ha individuato ciò che era ancora aperto**: un'asserzione SAML catturata poteva essere riprodotta, una richiesta MFA sopravviveva a un numero qualsiasi di codici errati, la ricerca della chiave API a ogni richiesta era una scansione completa della tabella, `MAX_WORKSPACE_SIZE_GB` era configurazione morta e il sanitizzatore SVG lasciava passare href `javascript:` senza virgolette. (#620)
- **Nove CVE divulgate corrette**: fast-uri, svgo, sharp e tar in modo transitivo (#619), più Pillow 12.3.0 (#517). La decodifica RAW su arm64 ora compila LibRaw 0.22.2 dai sorgenti invece di collegare una copia di sistema non corretta. (#649)

### Nuove funzionalità {#v2-2-0-new-features}

- **Ritaglio Arrotondato**: maschere quadrate con angoli arrotondati e stile squircle iOS, con un controllo del raggio degli angoli. Pensato per favicon e icone delle app. (#602)
- **Rimozione dello sfondo dai GIF**: rimuovi lo sfondo da un GIF, WebP o APNG animato fotogramma per fotogramma e ottieni un'animazione trasparente. (#502)
- **Lazo e modalità Alta qualità in Cancella oggetti**: trascina un contorno libero invece di colorare ogni pixel e, se vuoi, installa un bundle di inpainting diffusion per riempimenti più puliti su aree estese. (#503, #566)
- **Salva come nuovo oppure sovrascrivi.** Modificare un file della libreria sostituiva in precedenza l'originale senza avvisare. Ora scegli a ogni modifica, e l'impostazione predefinita conserva l'originale. (#564, #577)
- **Preset di proporzioni in Ridimensiona.** Scegli 1:1, 4:3 o 16:9 e le due dimensioni restano bloccate, senza upscaling. (#530)
- **OCR a due livelli**: un livello veloce è integrato nell'immagine e funziona offline senza download, mentre un runtime più accurato si installa su richiesta. (#519)
- **Digita ovunque per cercare.** Inizia a scrivere nella dashboard o nella home page e il testo arriva nella casella di ricerca. (#644)
- **Documentazione e sito web in 21 lingue**: il sito della documentazione, le landing page e il riferimento API sono ora tradotti, insieme all'interfaccia dell'app. Una nuova guida alla distribuzione su risorse limitate copre Raspberry Pi e macchine con 2 GB. (#548)
- **Nomi degli strumenti più chiari**: 18 nomi ambigui ora si qualificano da soli, quindi "Compress" è diventato "Compress Image". Gli id e le route degli strumenti restano invariati, quindi nessun bookmark si rompe. (#520)

### Miglioramenti {#v2-2-0-improvements}

- **Contrasto WCAG AA in tutta l'interfaccia**: la palette è stata ricalibrata in modo che l'arancione acceso resti sui riempimenti mentre testo ed etichette usano token di colore accessibili, e tutti i 57 indicatori di focus ora superano la soglia di 3:1 per gli elementi non testuali. (#567, #574)
- **Ingrandimento immagine e rimozione dello sfondo non sembrano più bloccati**: la barra di avanzamento avanza durante l'inferenza invece di fermarsi al 30%, ed entrambi gli strumenti ora avvisano che un host solo CPU è molto più lento. (#605, #608)
- **I messaggi di timeout indicano la causa reale** e tengono conto degli host solo CPU invece di dare la colpa al caricamento. (#596)
- **SnapOtter attende Postgres e Redis all'avvio** invece di entrare in un ciclo di riavvii, sia in Compose sia nell'immagine all-in-one. Un'installazione Proxmox LXC si era riavviata 76 volte prima di questa correzione. (#537, #595)
- **I download sopravvivono a un reverse proxy**: SnapOtter chiede a nginx e ai proxy compatibili di non bufferizzare le risposte dei file, che è la solita ragione per cui un download auto-ospitato inizia e non finisce mai. (#604, #607)
- **Comprimi PDF si avvicina alla dimensione obiettivo**, e lo dice onestamente quando un obiettivo è irraggiungibile. (#522)
- **I controlli degli strumenti su mobile restano raggiungibili** ora che le shell dell'app si adattano alla viewport dinamica. (#559)
- **Converti Audio espone un'impostazione della frequenza di campionamento.** (#561)
- **Gli amministratori possono allentare la lunghezza minima della password**, fino a 1 per un'istanza su LAN affidabile. (#543)
- **L'MFA è self-service**, il blocco dovuto alla policy è stato chiuso e gli accessi OIDC o SAML ricevono una vera richiesta MFA invece di un blocco rigido. (#531, #536)
- **Un semplice `Error: Error` ora indica la sua causa.** Gli errori di codifica di Sharp, le terminazioni del sidecar AI, l'output non JSON del sidecar documenti e gli errori di rimozione dello sfondo arrivavano tutti con la ragione rimossa. (#532, #534, #535, #538, #612)
- **La finestra di aiuto è tradotta.** Le etichette delle scorciatoie e il testo introduttivo erano codificati in inglese mentre le traduzioni complete restavano inutilizzate in tutti i 21 file di localizzazione. (#647)

### Correzioni di bug {#v2-2-0-bug-fixes}

- **I file HEIC degli iPhone venivano rifiutati** come illeggibili prima di raggiungere il decoder che li gestisce. (#631)
- **I preset di conversione fallivano con un secondo file**: jpg-to-pdf e le sue varianti image-to-pdf, oltre a pdf-to-png, pdf-to-jpg e pdf-to-tiff, restituivano tutti `Tool not found` dopo il caricamento di due file. (#633, #643)
- **I preset di conversione PDF perdevano il pulsante di download.** (#629)
- **Un timeout di elaborazione illimitato non veniva rispettato**, e gli stream di avanzamento bloccati ora si riprendono invece di lasciare l'interfaccia in attesa. (#638)
- **I download si bloccavano invece di fallire** quando un file memorizzato risultava più corto della lunghezza registrata. (#617)
- **Gli strumenti per le pagine PDF fallivano su file brevi e cifrati**: Rimuovi Pagine impostava per impostazione predefinita un intervallo di pagine che nessun documento con meno di sei pagine ha, e i PDF protetti da password fallivano con un errore oscuro nel worker. (#594)
- **PDF in Testo restituiva silenziosamente un file vuoto** per i PDF scansionati. Ora ti indirizza verso l'OCR e restituisce il testo come UTF-8. (#603)
- **PDF in Word perdeva blocchi di testo colorati** e li spezzava sulla pagina. (#500)
- **Cancella oggetti lasciava residui fantasma** e sfocava i piccoli oggetti nelle immagini ad alta risoluzione. (#501)
- **Stabilizza Video produceva output non riproducibile** senza faststart. (#593)
- **Correzioni all'editor di immagini**: rotazione, capovolgimento, ridimensionamento, livelli, curve, filtri e blocco dei livelli. (#597)
- **Firma PDF mostrava una tela vuota** invece di segnalare perché un PDF non si era caricato. (#545)
- **La libreria file registrava dimensioni 0x0** e saltava le anteprime per i caricamenti HEIC, RAW e PSD. (#636, #637)
- **L'installazione di più di un bundle AI** lasciava il virtualenv condiviso con più versioni e rompeva silenziosamente tre strumenti. (#649)
- **La conversione in JXL con qualità da 1 a 4 restituiva un 500**, e un ffmpeg mancante veniva segnalato come caricamento corrotto. (#649)
- **Un'interruzione temporanea di Postgres lasciava orfani i lavori completati**, con l'output su disco e nessuna riga che lo puntasse. Un riconciliatore ora adotta quel lavoro invece di scartarlo. (#649)
- **Un endpoint Redis che cambiava indirizzo bloccava ogni consumer** mentre i controlli di integrità rispondevano ancora 200. (#649)
- **Correzioni al sito e alla documentazione**: i link localizzati non perdono più i frammenti `#` né trasformano `zh-CN` in minuscolo, la navigazione della documentazione resta dentro la viewport sui tablet e nessuno dei due siti chiama più l'API di GitHub dal browser. (#516, #562, #570, #560)

### Note di aggiornamento {#v2-2-0-upgrade-notes}

Niente da migrare, ma sono cambiati due valori predefiniti forniti con l'app:

- **`TRUST_PROXY` ora usa come predefinito `loopback,linklocal,uniquelocal`** invece di considerare attendibile ogni peer. Le reti bridge di Docker e quelle di Compose rientrano in questo intervallo, quindi la maggior parte delle configurazioni non richiede modifiche. Se il tuo reverse proxy raggiunge SnapOtter da un indirizzo pubblico, imposta `TRUST_PROXY` esplicitamente, altrimenti il rate limiting e i log di audit attribuiranno ogni richiesta al proxy.
- **`MAX_AI_JOBS_PER_USER` ha come predefinito 5** lavori AI in corso su file singolo per utente. Le esecuzioni AI batch e pipeline restano senza limite.

Nuovi parametri facoltativi: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (disattivata per impostazione predefinita) e `GIF_BG_MAX_FRAMES`.

### Ringraziamenti {#v2-2-0-acknowledgements}

Buona parte di questa release è nata dalla segnalazione di bug di qualcun altro.

Codice e contributi:

- **@mvanhorn** ❤️: Ha riscritto l'errore di timeout della rimozione dello sfondo trasformandolo in un messaggio che spiega cosa fare, invece di un semplice timeout. (#518, #494)
- **@EuanTop** ❤️: Ha ripristinato l'azione di download nelle pagine dei preset di conversione PDF facendo restituire alla route sincrona il contratto standard dei risultati degli strumenti. (#629, #623)
- **@harshjainnn** ❤️: Ha diagnosticato il download che inizia e non finisce mai e ha proposto la direzione del reset del socket su cui si basa la correzione. (#617, #590)

Divulgazioni di sicurezza:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Ha divulgato privatamente l'escalation di privilegi tramite un ruolo delegato `users:manage`, con un'analisi completa dalla sorgente al sink e una catena di exploit funzionante. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Ha divulgato un IDOR autenticato sull'annullamento dei lavori e un path traversal nei nomi memorizzati della libreria, raggiungibile dopo un'importazione SQLite 1.x malevola, con una proof of concept funzionante per ciascuno. (#599, #600)

Segnalazioni di bug:

- **@riz467** ❤️: File HEIC reali da iPhone rifiutati in fase di validazione, con la causa principale individuata nella segnalazione. (#622)
- **@coupej** ❤️: Pagine dei preset PDF bloccate all'infinito e jpg-to-pdf che falliva appena si aggiungeva un secondo file. Due bug distinti, separati correttamente. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` documentato come illimitato ma limitato a cinque minuti. (#630)
- **@bezibaerchen** ❤️: Converti Audio nascondeva l'impostazione della frequenza di campionamento promessa dalla sua stessa descrizione. (#558)
- **@hell-toupee** ❤️: Il bundle OCR accurato non si installava a causa di un errore `libpaddle`. (#505)
- **@Michael1260** ❤️ e **@And-CSH** ❤️: Hanno confermato in modo indipendente l'errore di installazione OCR e stabilito che l'estrazione manuale funziona mentre il programma di installazione integrato no, il che ha circoscritto il bug all'installer. (#505)
- **@TomErnst1972** ❤️: L'attivazione della policy che richiede MFA chiudeva fuori un amministratore dalla propria istanza. (#515)
- **@thokich** ❤️: La cancellazione degli oggetti produceva riempimenti sfocati e inutilizzabili, il che ha portato sia alla riscrittura dell'inpainting HD sia al bundle opzionale di alta qualità. (#141)
- **@Hennie-git** ❤️: Un'installazione Proxmox LXC che si riavviava 76 volte contro un Postgres che non accettava ancora connessioni. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Ha analizzato quella segnalazione in tempo reale e prodotto la diagnosi su cui si basa la correzione dell'avvio. (#537)

Richieste di funzionalità e feedback:

- **@LECOQQ** ❤️: Ha chiesto di allentare la complessità delle password in un'installazione su home server. (#136)
- **@killervette42** ❤️: Ha chiesto un'Unraid Community App, ora pubblicata nello store Unraid CA. (#96)
- **@alienatedsec** ❤️: Ha fatto notare che la correzione del fallback da GPU a CPU era sepolta in una issue chiusa e impossibile da trovare, ed è per questo che ora è nella documentazione sulla distribuzione. (#490, #587)
- **@neilp316** ❤️: Ha confermato l'errore della GPU Blackwell su una RTX 5060 e ha tracciato un percorso di aggiornamento funzionante a CUDA 12.8. (#120)
- **@Roiki11** ❤️: Ha sostenuto l'archiviazione condivisa con riferimenti di percorso rispetto al trasferimento file HTTP per il calcolo AI fuori dalla macchina. (#189)

Grazie anche ai membri della community che hanno segnalato questi problemi su Discord e via email, i cui nomi non abbiamo registrato: la richiesta del ritaglio squircle (#602), il download image-to-PDF che iniziava e non finiva mai (#604, #607), lo strumento Rimuovi Pagine che si bloccava (#594), il testo arabo mancante in pdf-to-text (#603) e la diagnosi alla base del fallback GPU ONNX (#490).

[Diff completo su GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 trasforma il toolkit per immagini in una suite completa di manipolazione file: oltre 200 strumenti su cinque modalità (Immagine, Video, Audio, PDF e File), ricostruita su Postgres 17 e una coda di lavori basata su Redis, con un `docker run` a comando singolo. Questa è una release importante; leggi le Modifiche incompatibili prima di aggiornare dalla 1.x.

### Nuove funzionalità {#new-features}

- **Quattro nuove modalità di strumenti**: Video, Audio, PDF e File si aggiungono a Immagine, portando il catalogo a oltre 200 strumenti.
- **Lavori in background durevoli**: una coda basata su Redis (BullMQ) esegue ogni strumento come lavoro tracciato con avanzamento SSE in tempo reale.
- **Modalità all-in-one a container singolo**: un solo `docker run` avvia un'istanza completa con Postgres e Redis incorporati.
- **Bundle AI su richiesta**: rimozione dello sfondo, OCR, trascrizione, upscaling, rilevamento e miglioramento dei volti, gomma per oggetti, colorazione e restauro fotografico si installano dall'interfaccia. L'accelerazione GPU viene rilevata per ogni framework.
- **Firma PDF**: disegna, digita o carica una firma e posizionala su un PDF direttamente nel browser.
- **Automazione**: un costruttore visuale di pipeline che concatena strumenti, con nove modelli predefiniti.
- **83 preset di conversione con un clic**: convertitori dedicati JPG-a-PNG, MP4-a-GIF e simili con ricerca fuzzy.
- **Editor di immagini a livelli**: un editor basato su Konva in `/editor` con pennelli, forme, regolazioni, filtri e curve.
- **Libreria File**: salva qualsiasi risultato e riutilizzalo come input per un altro strumento.
- Strumenti fissati, zoom e panoramica in-canvas, 21 lingue e funzionalità enterprise (OIDC/SSO, SAML, SCIM, archiviazione S3, permessi per singolo strumento, esportazione dei log di audit, tracciamento distribuito).

### Miglioramenti {#improvements}

- Annulla un processo in esecuzione. (#137)
- Decodifica RAW a piena risoluzione tramite LibRaw, incluso DNG. (#289)
- Deployment non-root e con UID esterno (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Rilevamento accurato dell'installazione AI e un flusso di installazione irrobustito. (#214, #352)
- Rafforzamento della privacy: nessuna trasmissione automatica a terze parti, più una modalità offline stretta opzionale.
- Pulsante di feedback sempre attivo, anche con le analisi disattivate.

### Correzioni di bug {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` disabilita di nuovo il rate limiting per le route degli strumenti. (#271)
- Riparati i percorsi del virtualenv AI all'interno dell'immagine Docker. (#390)
- Compatibilità con sharp 0.35.2+. (#362)
- Correzioni al layout dell'editor di immagini: righelli, comportamento del riempimento, barra laterale e dimensionamento del canvas. (#258, #259)
- Completata la traduzione italiana. (#231, #206, #425)
- La normalizzazione audio e loudnorm preservano la frequenza di campionamento sorgente.
- Rafforzamento SSRF: corrispondenza numerica dei CIDR IPv6 e una pre-scansione URL ampliata. (#287)
- I PDF generati vengono marcati con SnapOtter come Producer.
- mediapipe si installa su Python 3.13 e Debian 13.

### Modifiche incompatibili {#breaking-changes}

2.0 sostituisce il database SQLite incorporato con Postgres 17 e aggiunge Redis 8 per la coda dei lavori. I tuoi dati 1.x vengono migrati automaticamente al primo avvio, ma lo stack di container è cambiato, quindi esegui prima il backup dell'intero volume `/data` (la 1.x esegue SQLite in modalità WAL, quindi i dati committati risiedono di solito in `snapotter.db-wal`). Poi scegli l'immagine a container singolo (Postgres e Redis incorporati, solo root) o lo stack Compose (app più Postgres 17 e Redis 8). Consulta la [guida alla migrazione](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) e la [guida all'aggiornamento](/it/guide/upgrading).

### Aggiornamento {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Oppure con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo su GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nuovo strumento HTML a Immagine, accessibilità WCAG 2.2 AA, rafforzamento della sicurezza dai penetration test e 5 correzioni Docker critiche.

### Nuove funzionalità {#new-features-1}

- **HTML a Immagine**: cattura screenshot di URL o HTML grezzo come PNG/JPEG/WebP. Catture a pagina intera, viewport personalizzati, modalità scura.
- **Convenzione Docker _FILE per i segreti**: monta le variabili d'ambiente sensibili come file invece che in testo semplice. (#205)
- **Licenza enterprise e archiviazione S3**: chiave di licenza commerciale opzionale e archiviazione a oggetti compatibile con S3.
- **Miglioramenti all'editor di forme**: trasparenza di riempimento/contorno, selettore di colore RGBA, stili di linea tratteggiata.
- **Archivi di release predefiniti**: scarica i tarball dalle GitHub Releases per installazioni non-Docker (Proxmox, bare metal, LXC). (#202)

### Miglioramenti {#improvements-1}

- **Accessibilità WCAG 2.2 AA**: salto della navigazione, focus trapping, regioni aria-live, supporto per il movimento ridotto, rapporti di contrasto corretti. (#209)
- **Reattività mobile**: impostazioni responsive, riconnessione automatica SSE al cambio di scheda su mobile. (#203, #204)
- **Qualità della rimozione dello sfondo**: smussatura dei bordi, decontaminazione del colore, selezione del formato di output.
- **Traduzione italiana**: ~145 nuove stringhe di @albanobattistella. (#206)
- **Documentazione API per singolo strumento**: 53 pagine di documentazione con parametri, esempi e formati di risposta.
- **Download dei modelli AI**: logica di retry con backoff esponenziale per HuggingFace. (#201)

### Correzioni di bug {#bug-fixes-1}

- I container Docker appena avviati erano completamente inutilizzabili (il rate limit bloccava tutte le richieste).
- Gli strumenti AI di rilevamento volti (blur-faces, red-eye-removal, enhance-faces, passport-photo) fallivano su tutte le piattaforme.
- File HEIC non funzionanti su ARM (mismatch dei simboli libheif).
- I bundle AI di upscale e restore-photo non riuscivano a installarsi su ARM.
- OCR usava la versione CUDA errata sui container GPU.
- Bypass del guard SSRF tramite indirizzi IPv6 esadecimali mappati su IPv4. (Merito: @tonghuaroot)
- Decodifica HEIC di iPhone con immagini ausiliarie. (#183, #199)
- OOM CUDA di Real-ESRGAN su GPU da 8GB. (#200)
- 6 errori Sentry di produzione e 7 bug QA. (#208)

### Sicurezza {#security}

- 10 risultati dei penetration test risolti (bypass XFF, crash su JSON malformato, pipeline illimitate, XSS nei log di audit, metodo TRACE e altro). (#207)
- Bloccato il bypass SSRF con IPv6 esadecimale. (Merito: @tonghuaroot)
- Immagini base del Dockerfile fissate tramite digest.

### Aggiornamento {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Oppure con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo su GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Demo live, pagine di destinazione per singolo strumento e un lotto di correzioni di rifinitura.

### Nuove funzionalità {#new-features-2}

- **Demo live** - [demo.snapotter.com](https://demo.snapotter.com) permette di provare SnapOtter senza installare nulla.
- **Pagina indice degli strumenti** - Sfoglia tutti i 50+ strumenti in `/tools` con ricerca e filtri per categoria.
- **50+ pagine di destinazione SEO** - Ogni strumento ha ora una pagina di destinazione dedicata con FAQ, casi d'uso e tabelle di confronto.
- **Anteprima dello sfondo** - Lo slider prima-dopo mostra uno sfondo a scacchiera dietro le immagini trasparenti.
- **Generatore di password robuste** - Pulsante con un clic nel modulo Aggiungi membri.

### Correzioni di bug {#bug-fixes-2}

- Lo strumento info HEIC/HEIF non fallisce più (aggiunta pre-decodifica).
- L'installazione dei bundle di modelli AI mostra messaggi di errore migliori e rispetta i limiti di risorse.
- Le miniature della libreria si caricano correttamente (mancavano le intestazioni di autenticazione).
- I menu a discesa non vengono più tagliati nelle tabelle delle impostazioni Persone e Team.
- Percentuale di confronto delle dimensioni nascosta sugli strumenti non di compressione.
- Rimosso il link duplicato alla privacy policy.
- Aggiunta la traduzione italiana per le impostazioni delle funzionalità AI.
- Aggiornate le icone Lucide rinominate (Wand2, Columns).

### Infrastruttura {#infrastructure}

- OpenSSF Scorecard rafforzato da 4.3 a ~7.0.
- Test CI parallelizzati in 4 shard con fixture ridimensionate.
- 41 aggiornamenti delle dipendenze.

### Aggiornamento {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Oppure con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo su GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Cinque nuovi strumenti, un editor di immagini completo, login SSO, 20 lingue. Probabilmente avrebbero dovuto essere tre release separate, ma eccoci qui.

### Nuove funzionalità {#new-features-3}

- **Editor di immagini** - Livelli, pennelli, forme, regolazioni, filtri, curve, scorciatoie da tastiera. Gira nel tuo browser, elabora sul tuo hardware.
- **Autenticazione OIDC / SSO** - Accedi con Google, GitHub, Okta o qualsiasi provider OpenID Connect. Imposta qualche variabile d'ambiente e il tuo team usa gli account esistenti.
- **Generatore di meme** - 100 modelli integrati con rendering del testo tramite opentype.js. Oppure carica la tua immagine.
- **Beautify** - Trascina uno screenshot, ottieni un'immagine rifinita. Cornici del dispositivo (macOS, Windows, browser), ombre, gradienti, preset per i social media.
- **Simulazione del daltonismo** - Anteprima di come appaiono le immagini con protanopia, deuteranopia, tritanopia e altre deficienze della visione dei colori.
- **Correttore di trasparenza PNG** - Rileva i PNG con falsa trasparenza e li corregge con il matting HR di BiRefNet. Rimozione opzionale del watermark tramite inpainting LaMa.
- **Espansione AI del canvas** - Estende i confini dell'immagine con riempimento AI. Tre livelli di qualità (veloce, bilanciato, qualità) a seconda di quanto tempo GPU vuoi scambiare.
- **20 lingue** - Arabo, Cinese (Semplificato/Tradizionale), Ceco, Olandese, Francese, Tedesco, Hindi, Indonesiano, Italiano, Giapponese, Coreano, Polacco, Portoghese, Russo, Spagnolo, Thai, Turco, Ucraino, Vietnamita. RTL funziona per l'arabo.
- **Importazione da URL** - Incolla gli URL nella dropzone o importa in blocco da una lista. Fetch lato server con protezione SSRF.
- **Gomma multi-file** - Disegna maschere di cancellazione su più immagini, elaborale tutte con un clic. I tratti persistono per singola immagine.
- **Importazione/esportazione delle pipeline** - Salva le catene di strumenti come JSON, condividile con altri.
- **17 nuovi formati RAW di fotocamera** tramite exiftool, più input QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ e APNG. Nuovi codec di output per BMP, ICO, JP2, QOI. Esportazione AVIF, TIFF, GIF, JXL e PSD recuperata da un branch precedentemente perso.

### Miglioramenti {#improvements-2}

- **Miglioramento delle immagini** - Sostituita la vecchia pipeline con CLAHE + normalise + gamma. Il nuovo toggle Deep Enhance usa il modello AI per risultati più aggressivi.
- **Restauro foto** - Rilevamento dei graffi riscritto con filtraggio Otsu a 8 angoli. L'inpainting LaMa ora gira a risoluzione nativa.
- **Formati esotici ovunque** - OCR, image-to-PDF, generatore di favicon, composizione, stitch e vettorizzazione ora decodificano tutti HEIC, RAW, PSD.
- **Compressione** - Tolleranza sulla dimensione target ridotta dal 5% all'1%. La dimensione target è la modalità predefinita. Aggiunti pulsanti di incremento e selettore di unità KB/MB.
- **Pulizia Sentry** - 644 eventi non azionabili filtrati. Gli errori reali ora vengono gestiti correttamente.
- **Rilevamento GPU** - Diagnostica migliore per i container dove CUDA è presente ma nvidia-smi no.
- **Modalità con autenticazione disattivata** - Un utente anonimo viene inserito nel DB con ruolo admin. Chiavi API, pipeline e file utente non si rompono più sui vincoli FK.
- **2.705+ nuovi test** tra unit, integrazione ed E2E.

### Correzioni di bug {#bug-fixes-3}

- L'upscale su CPU non va più in timeout sui box NAS e sull'hardware a basso consumo.
- Il logo del codice QR non fa più sparire l'anteprima in modo permanente.
- Corretto l'overflow del ritaglio per le immagini in ritratto verticali.
- I file TIFF con alfa forzano correttamente l'output PNG invece di produrre corruzione.
- La decodifica HDR/EXR converte a 8 bit prima di CLAHE, correggendo i fallimenti di decodifica.
- I buffer di input dei landmark facciali vengono convertiti in PNG prima del sidecar Python, correggendo i crash.
- La ricerca dei duplicati gestisce i batch a formato misto e gli errori di rete.
- L'anteprima di Beautify si aggiorna in tempo reale.
- Barre di avanzamento per stitch e vettorizzazione.
- SVGZ gestito da SVG-a-raster.
- Nomi di file non ASCII corretti tramite l'intestazione X-File-Results codificata in percent-encoding.

### Aggiornamento {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Oppure con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Diff completo su GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Immagine Docker unificata con rilevamento automatico della GPU. Un'unica immagine gestisce i carichi di lavoro sia CPU sia GPU. Compose semplificato in un singolo file con rotazione dei log. I pre-download dei modelli ora includono la verifica e uno smoke test.

---

## v1.13.0 {#v1-13-0}

Controllo degli accessi basato sui ruoli (RBAC). 14 permessi granulari, tre ruoli integrati (admin, editor, user), supporto per ruoli personalizzati. Controlli dei permessi su tutte le route API. Schede del frontend filtrate in base ai permessi dell'utente.

---

## v1.12.0 {#v1-12-0}

Strumento PDF a Immagine. Converti le pagine PDF in PNG, JPEG, WebP o TIFF a DPI personalizzato. Immagine Docker unificata con rilevamento automatico della GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt auto-generato tramite vitepress-plugin-llms per una documentazione a misura di AI.

---

## v1.10.0 {#v1-10-0}

Ridimensionamento content-aware (seam carving) con protezione dei volti. Ridimensiona le immagini preservando i contenuti importanti.

---

## v1.9.0 {#v1-9-0}

Strumento Stitch / Combina. Unisci le immagini fianco a fianco, impilate verticalmente o in una griglia personalizzata.

---

## v1.8.0 {#v1-8-0}

Strumento Modifica metadati. Visualizza e modifica i metadati EXIF, IPTC e XMP con un'interfaccia granulare di rimozione/conservazione.

---

## Release meno recenti {#older-releases}

Per il changelog completo a livello di commit, incluse le release di patch, consulta le [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
