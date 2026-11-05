---
description: "Note di rilascio e cronologia delle versioni di SnapOtter. Scopra le novità, i miglioramenti e le correzioni di ogni release."
i18n_source_hash: 952098c65251
i18n_provenance: machine
i18n_output_hash: 28c60110de05
i18n_hash_version: 2
---

# Changelog {#changelog}

## v2.3.0 {#v2-3-0}

SnapOtter ha appena superato un milione di pull di immagini tra Docker Hub e GHCR, e 3.000 stelle su GitHub. Sono tantissimi server self-hosted, quindi questa release è il nostro ringraziamento a tutti coloro che li gestiscono.

Aggiorni presto. La 2.3.0 chiude sei advisory di sicurezza, una delle quali di gravità alta. I dettagli sono nella sezione Sicurezza qui sotto.

Oltre alle correzioni, ci sono nuovi strumenti: un editor di pagine PDF Multi-Tool, preset di compressione a dimensione target con un clic per immagini e PDF, e l'ordinamento delle pagine con trascinamento in Organizza PDF. L'OCR ora legge l'arabo, e pdf-to-text propone l'OCR quando incontra un PDF scansionato. SnapOtter può funzionare sotto un sottopercorso come `/snapotter` dietro un reverse proxy. L'app non richiede più un superuser Postgres per funzionare. Gli amministratori rimasti bloccati fuori possono recuperare l'accesso dalla riga di comando. Il resto sono circa 1.400 correzioni, la maggior parte per problemi che ci avete segnalato.

> [!IMPORTANT]
> Tutte e sei le advisory qui sotto riguardano la 2.2.0, e alcune risalgono fino alla 2.0.0. Se condivide un'istanza con altri utenti o la espone oltre la Sua rete, aggiorni.

### Sicurezza {#v2-3-0-security}

- **I caricamenti SVG potevano saltare la sanitizzazione (GHSA-9c7h-xjrp-8gh3, alta).** Un SVG rifiutato dal decoder di immagini veniva memorizzato e servito così com'era invece di essere sanitizzato. Interessate: 2.2.0 e precedenti. Segnalato da @xaferima. (#1211)
- **Il flusso di avanzamento dei job non verificava chi lo richiedeva (GHSA-ff22-w6x2-fm98, media).** Ora richiede l'accesso e la proprietà del job. Interessate: da 2.0.0 a 2.2.0. (#1750)
- **I link di download dei risultati servivano anche l'upload originale (GHSA-jgv3-2jc6-f628, media).** Interessate: 2.2.0 e precedenti. Segnalato da @emirhancatkin. (#3623)
- **La foto tessera e gli effetti di sfondo si fidavano di un ID job fornito dal client (GHSA-3c8g-8v4x-qq9j, media).** Interessate: 2.2.0 e precedenti. Segnalato da @shaoyuuuuu. (#3623)
- **Importazione da URL, upload e anteprima saltavano i controlli dei permessi di ruolo e chiave API (GHSA-8xxr-g2w8-7f9r, media).** Interessate: 2.2.0 e precedenti. Segnalato da @nguyenvantiennani. (#3780, #707)
- **L'applicazione forzata dell'SSO rivelava il nome utente break-glass (GHSA-q6fg-vvw9-cr8r, bassa).** Un login locale rifiutato ora riceve lo stesso 401 di qualsiasi altro login fallito. Interessate: da 2.0.0 a 2.2.0. (#2148)
- **Postgres non viene più eseguito come superuser.** L'app ora si connette con un ruolo che può solo leggere e scrivere dati. Le migrazioni usano una connessione separata e facoltativa. Vedere le Note di aggiornamento. (#918)
- **Dipendenze aggiornate**: le soglie minime di override per dompurify e handlebars sono state portate alle versioni corrette. (#4247)

### Nuove funzionalità {#v2-3-0-new-features}

- **PDF Multi-Tool**: un editor di pagine che riordina, duplica, ruota ed elimina le pagine, e importa pagine da altri PDF. Il server assembla il file finale. (#1338)
- **Compressione a dimensione target con un clic**: cinque preset per le immagini (20, 50, 100, 200, 500 KB) e cinque per i PDF (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **Esegua SnapOtter sotto un sottopercorso**: imposti `BASE_PATH=/snapotter` e la stessa immagine risponde da lì. Link dei risultati, cookie, reindirizzamenti SSO e documentazione dell'API lo seguono. (#1252, #1324)
- **OCR arabo**: scelga esplicitamente l'arabo, oppure lasci che la modalità automatica lo rilevi. Funziona per l'OCR di immagini e PDF. (#4130, #4183)
- **pdf-to-text propone l'OCR** quando un PDF, o un intero batch, non ha livello di testo, invece di restituire un file vuoto. (#4142, #4198)
- **Ordinamento delle pagine con trascinamento in Organizza PDF**, con mouse e touch. (#1249, #2601)
- **Riordino dei file prima di un'esecuzione multi-file**: unione, stitch, collage e gli altri strumenti multi-file mantengono l'ordine impostato. (#756, #757)
- **Annullamento delle esecuzioni batch e pipeline**, e il lavoro si ferma davvero sul server. (#807)
- **Comandi di recupero `snapotter-admin`**: `reset-password`, `create-admin`, `unlock-user` e reimpostazione MFA, per gli amministratori bloccati fuori dall'interfaccia web. (#4016)
- **Registrazione MFA al login**: quando l'MFA è obbligatoria, gli utenti che non l'hanno la configurano subito invece di essere bloccati.
- **Acquisizione da fotocamera e app installabile**: scatti una foto direttamente in uno strumento da mobile e installi SnapOtter come PWA. (#773)
- **Padding trasparente nella finestra Dimensione canvas dell'editor.** (#4111)
- **Avvisi di aggiornamento per gli amministratori**: quando è disponibile una versione più recente di SnapOtter, gli amministratori vedono un avviso chiudibile con un link alle note di rilascio. Il controllo passa dalla connessione di analytics esistente, quindi è disattivato quando analytics è disattivato.

### Miglioramenti {#v2-3-0-improvements}

- **La rimozione dello sfondo è più veloce nelle esecuzioni ripetute**: il modello resta caricato tra le richieste invece di essere ricaricato ogni volta. (#4144)
- **I caricamenti batch usano molta meno memoria**: ogni file va su disco di scratch e viene elaborato uno alla volta invece di restare in RAM. (#2687)
- **Le installazioni dei bundle AI falliscono in modo pulito e fanno rollback** invece di lasciare un venv installato a metà. Le installazioni di rimozione sfondo su Proxmox LXC funzionano di nuovo, e gli host con poca memoria ricevono limiti CPU sensati prima dell'avvio di un job. (#2628, #2597, #2526, #2546)
- **Il rilevamento della GPU è più affidabile**: CUDA viene rilevato tramite il driver, le schede serie RTX 50 ricadono sulla CPU invece di fallire, e gli encoder video hardware vengono provati prima dell'uso. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` ora funziona**. Veniva analizzato ma mai applicato. (#3249)
- **Gli strumenti lunghi ottengono il timeout lungo**: pdf-to-word, compress-pdf, convert-document e il ridimensionamento content-aware non vanno più in timeout in anticipo su file grandi. (#3276)
- **Comprimi PDF mantiene leggibili le scansioni**, e lo segnala quando non è possibile raggiungere una dimensione target invece di produrre un file illeggibile. (#4112)
- **I login falliti sono limitati per nome utente**: più di dieci in quindici minuti ricevono un 429 con `Retry-After`. (#827)
- **Gli errori dicono cosa è andato storto**: binari mancanti, guasti dello storage, terminazioni per memoria esaurita e limiti di upload ora ricevono messaggi specifici invece di un semplice 500 o 422.
- **L'audit log copre le esecuzioni di strumenti, batch e pipeline**, e gli eventi di utenti, ruoli, team e GDPR registrano chi ha fatto cosa a chi. (#3991, #3984)
- **Il container all-in-one si ferma dopo un primo avvio non riuscito** invece di riavviarsi all'infinito, e Postgres e Redis embedded hanno scadenze di avvio. (#3008, #1130)
- **Date e plurali seguono la Sua lingua**, e le ultime stringhe inglesi inserite nel codice sono tradotte.
- **Rifiniture per mobile ed editor**: layout di slider, Firma PDF e ritaglio sui telefoni, trascinamento touch, pennelli a pixel più veloci, e Livelli e Curve in annulla e salvataggio automatico.

### Correzioni di bug {#v2-3-0-bug-fixes}

- **Regola colori combinava male le impostazioni**: temperatura, saturazione, tonalità, contrasto e seppia si sovrascrivevano a vicenda invece di sommarsi. (#3153, #3120, #3469)
- **Pixelate non pixelava**, e l'output PNG veniva ridotto silenziosamente a palette in vari strumenti per immagini. (#709, #716)
- **GIF e WebP animati perdevano fotogrammi** in diversi strumenti, e le palette e la trasparenza delle GIF risultavano errate. (#1184, #1225, #3407, #2573)
- **I caricamenti ruotati perdevano qualità**: l'orientamento automatico eliminava la codifica lossless, la trasparenza e la profondità a 16 bit. Il WebP animato ora ruota ogni fotogramma. (#2384, #2529)
- **TIFF con trasparenza, file HEIF AV1 e diversi formati RAW** fallivano o perdevano l'alfa. (#2609, #2572, #1120)
- **Ridimensionare il canvas dell'editor scalava l'immagine** invece di aggiungere spazio attorno ad essa. (#2081)
- **I nomi dei file di output venivano alterati**: `.jpeg` e `.tif` diventavano qualcos'altro, e i dotfile o i nomi che ripetono la propria estensione si rompevano. (#3495, #3382)
- **Il salvataggio automatico nella libreria ignorava la quota di storage**, e i contatori dello storage potevano diventare negativi. (#2389, #2585)
- **I job bloccati dopo un riavvio** ora vengono sistemati all'avvio invece di mostrare "in elaborazione" per sempre. (#3219, #3193)
- **L'accesso OIDC chiamava "admin" ogni nuovo utente**, e gli accessi da Safari su iOS finivano su una pagina di errore dopo essere riusciti. (#862, #4021)
- **Le regole password disattivate venivano comunque applicate** alla creazione degli utenti. (#1028)
- **I PDF danneggiati si bloccavano per 30 secondi** prima di fallire. (#920)
- **Il controllo dello spazio su disco per i bundle AI richiedeva circa 18 GB** per installare un singolo bundle. (#1248)
- **Comprimi video falliva sulle registrazioni dello schermo a frame rate variabile.** (#2427)
- **La rimozione sfondo batch perdeva i risultati completati** quando il browser ritentava la richiesta. (#2015)
- **I campi numerici nelle impostazioni non si potevano svuotare** durante la digitazione. (#1449)
- **Disattivare analytics lasciava eventi in coda da inviare** circa 30 secondi dopo. Ora vengono scartati quando si esegue l'opt-out. (#4270)

### Note di aggiornamento {#v2-3-0-upgrade-notes}

Le migrazioni vengono eseguite da sole all'avvio. Non è necessario eseguire alcun SQL.

- **Ruoli del database.** Il file Compose canonico ora assegna all'app un ruolo che può solo leggere e scrivere dati (`DATABASE_URL`) e una connessione privilegiata separata (`DATABASE_MIGRATION_URL`) usata solo all'avvio per migrazioni e privilegi. Un file Compose esistente continua a funzionare come prima: lasci `DATABASE_MIGRATION_URL` non impostato e SnapOtter funziona con un solo ruolo. Per un deployment non locale, imposti `POSTGRES_APP_PASSWORD` insieme a `POSTGRES_PASSWORD`.
- **Controlli di avvio più severi.** Prima fallivano più tardi, o in silenzio. Ora fermano il container con un messaggio che indica la variabile: un `DEFAULT_LOCALE` non supportato (usi un codice supportato come `de`, non `de_DE`), `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL` o `OIDC_ISSUER_URL` malformati quando l'SSO è attivo, un elenco `TRUST_PROXY` non valido, un `BASE_PATH` errato e un `LOG_DIR` non scrivibile.
- **`TRUST_PROXY` non accetta più un numero di hop.** Un numero come `TRUST_PROXY=2` ora ferma il container all'avvio invece di non fidarsi silenziosamente di alcun proxy. Lo imposti sugli indirizzi dei proxy o su intervalli con nome (il valore predefinito è `loopback,linklocal,uniquelocal`), su `false` quando nessun proxy sta davanti a SnapOtter, o su `true` solo quando un proxy sotto il Suo controllo si trova davanti a un indirizzo pubblico. (#998)
- **`MAX_WORKER_THREADS` ora ha effetto.** Se lo aveva impostato senza vedere alcun cambiamento, ora lo vedrà.
- **Codici di stato dell'API.** I guasti del motore e dello storage restituiscono 503 `ENGINE_UNAVAILABLE` (gli endpoint batch restituivano 422). Gli upload oltre il limite restituiscono 413 (era 400). Un `clientJobId` malformato restituisce 400 e uno riutilizzato 409 (era 500). Rieseguire il batch di una Sua pipeline restituisce 202. `mode=targetSize` senza `targetSizeKb` restituisce 400. Un login locale rifiutato con SSO forzato restituisce 401 invece di 403 `SSO_ENFORCED`. I login limitati restituiscono 429 `LOGIN_THROTTLED`. Il risultato di rimozione sfondo non include più `originalUrl`.
- **Nuove variabili facoltative**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (15 minuti per impostazione predefinita, `0` la disattiva), `EMBEDDED_REDIS_TIMEOUT_S` (180) e `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **I file Compose vengono distribuiti con la release.** `docker-compose.yml` e `docker-compose-gpu.yml` sono allegati a questa release, quindi può scaricarli direttamente dalla pagina della release.

### Ringraziamenti {#v2-3-0-acknowledgements}

Un milione di pull significa moltissime persone che segnalano bug, inviano correzioni e ci dicono cosa mancava. Questa release è in gran parte opera loro.

Codice e contributi:

- **@zakka258** ❤️: Ha creato l'editor di pagine PDF Multi-Tool e il deployment sotto sottopercorso, due delle funzionalità più grandi di questa release, inclusi i test per autenticazione e SSO sotto un sottopercorso. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Ha creato i preset di compressione a dimensione target con un clic per le immagini, corretto la concorrenza e la pulizia delle anteprime, e impedito che lo storage del browser bloccato facesse restare bloccato lo spinner di login. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Ha aggiunto il riordino delle pagine con trascinamento a Organizza PDF, che aveva richiesto per primo nelle Discussions. (#1249, #965)
- **@drakeo338** ❤️: Dieci correzioni su tutto lo stack, tra cui l'orientamento automatico che mantiene formato e qualità, i gruppi SCIM creati in un'unica transazione, le installazioni AI sotto cgroup v2 e gli errori 5xx non più mascherati da 422. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Ha aggiunto il padding trasparente del canvas all'editor, corretto i verdetti obsoleti della dimensione target di Comprimi PDF e consentito aggiornamenti parziali dei team. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Ha impedito alle istanze self-hosted di inviare dati heatmap, validato `TRUST_PROXY` all'avvio invece di andare in crash, e corretto la gestione dei nomi di gruppo SCIM e del timeout di qpdf. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Ha trasformato diversi 500 in risposte corrette 400 e 409 per ID job malformati e importazioni multipart, e corretto lo svuotamento dei campi numerici nelle Impostazioni. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Ha fatto funzionare la lettura dei codici a barre offline includendo il suo decoder, corretto le anteprime multimediali che mostravano l'input e migliorato la ricerca dei formati. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Ha segnalato e corretto il fallimento di Comprimi video sulle registrazioni dello schermo a frame rate variabile. (#2426, #2427)
- **@dvd233** ❤️: Ha reso disponibili tutti i formati RAW di fotocamera supportati dal decoder, e fatto comparire gli strumenti favicon nelle ricerche per ICO. (#1120, #1121)
- **@bercedev** ❤️: Ha corretto i nomi di file in cui il nome ripete l'estensione, e fatto sì che l'AI riporti il dispositivo su cui è effettivamente in esecuzione. (#3382, #3613)
- **@pamod-madubashana** ❤️: Ha tradotto l'ultima intestazione MFA rimasta solo in inglese e collegato le stringhe di avanzamento inutilizzate. (#1228, #1227)
- **@mvanhorn** ❤️: Ha corretto l'assegnazione di nomi utente duplicati nell'accesso SAML. (#2640)
- **@peremunoz** ❤️: Ha impedito che la generazione di codici a barre nascondesse guasti di storage e memoria dietro "Testo non valido". (#4057)
- **@mayuriphad** ❤️: Ha corretto un crash dovuto a un header di autenticazione di avviso memorizzato malformato. (#3080)
- **@DevShoaib78** ❤️: Ha corretto la chiusura del lazo poligonale nell'editor. (#1207)
- **@dltsum** ❤️: Ha spostato le visualizzazioni di avanzamento sul catalogo di messaggi condiviso. (#1262)
- **@albanobattistella** ❤️: Correzioni di traduzione. (#1024)
- **@shoaibyazdani** ❤️: Ha rigenerato i baseline visivi di macOS. (#2475)

Segnalazioni di sicurezza:

- **@xaferima** ❤️: Ha scoperto che gli SVG rifiutati dal decoder saltavano la sanitizzazione, e ha analizzato l'impatto insieme a noi. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Ha scoperto che i link dei risultati servivano anche l'upload originale. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Ha scoperto che la foto tessera e gli effetti di sfondo si fidavano di un ID job fornito dal client. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: Ha scoperto che l'importazione da URL saltava i controlli dei permessi. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: Ha segnalato bypass IPv6 dei controlli degli indirizzi SSRF, con proof of concept funzionanti. Le correzioni sono state rilasciate nella 2.0.0, e questo ringraziamento è in ritardo. (#287)

Segnalazioni di bug:

- **@kabo** ❤️: L'esempio di `docker-compose.yml` non funzionava. (#1027)
- **@xromen** ❤️: I PDF danneggiati che si bloccavano fino al timeout di 30 secondi di qpdf. (#920)
- **@snmabaur** ❤️: L'accesso OIDC che impostava il nome di ogni profilo su "admin". (#862)
- **@CodecNomad** ❤️: Lo strumento Sfocatura che duplicava l'immagine. (#829)
- **@ohora0923** ❤️ e **@Alexis-VS-CSharp** ❤️: Pixelate che non funzionava. (#678, #775)
- **@mptpro** ❤️: Il download AI per la rimozione dello sfondo che falliva. (#714)
- **@dominic427** ❤️: Il ridimensionamento del canvas dell'editor che scalava l'immagine invece di estenderla. (#2016)
- **@CodeByToast** ❤️: I campi numerici nelle Impostazioni che non si potevano svuotare. (#1186)
- **@gioxx** ❤️: Il controllo dello spazio su disco dei bundle AI che richiedeva circa 18 GB per un solo bundle. (#1248)
- **@rekcodocker** ❤️ e **@madmike970** ❤️: Le installazioni dei bundle AI che fallivano su Proxmox LXC, con i dettagli del container che hanno aiutato a individuare il problema. (#1030, #352)
- **@wxf26054** ❤️: Le regole password disattivate ancora applicate alla creazione degli utenti. (#1028)
- **@ersil** ❤️: Safari su iOS che richiedeva due volte il callback OIDC e finiva su una pagina di errore dopo un accesso riuscito. (#4021)
- **@casi-3** ❤️: La rimozione sfondo batch che perdeva i risultati completati quando il browser ripeteva la richiesta, con una diagnosi precisa. (#2015)
- **@killervette42** ❤️: Il guasto della GPU Blackwell su unRaid, che ha portato al fallback su CPU per le RTX serie 50. (#120, #4075)

Richieste di funzionalità e feedback:

- **@photoevents** ❤️: Ha misurato che la rimozione dello sfondo impiegava circa 11 secondi per caricare il modello e 1 secondo per l'inferenza, ha proposto di mettere in cache le sessioni e condiviso quanto aveva imparato eseguendo una propria cache. Da qui è nata la cache di sessione di questa release. (#768, #776, #4144)
- **@benbou8231** ❤️: Ha fatto notare che i file importati finiscono in ordine inverso negli strumenti multi-file, il che ha portato al riordino prima dell'esecuzione. (#729, #756)
- **@cf3901646** ❤️: Ha ricondotto un rumoroso errore di produzione alla classe di errori Postgres 58 e proposto la correzione. Non abbiamo potuto unire la loro PR senza un CLA firmato, quindi abbiamo scritto noi la stessa correzione. (#4210, #4253)
- **@chiliec** ❤️: Ha notato che un orientamento automatico fallito veniva ignorato in silenzio e che l'avanzamento dell'installazione ignorava il catalogo delle traduzioni. Entrambe le proposte sono state rilasciate tramite PR dei maintainer. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Ha proposto di serializzare in single-flight l'importazione del modulo enterprise, la correzione per le richieste SCIM concorrenti che non concordavano sulla licenza. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Ha fatto notare che la guida alla configurazione non menzionava mai gli override dei binari dei motori né `SNAPOTTER_HW_ACCEL`, che ora sono documentati. (#1312, #1696)
- **@aron-intframe** ❤️: Ha riprodotto una lacuna nella gestione degli errori di exiftool su un clone nuovo e scoperto che la race condition sul percorso temporaneo era peggiore di quanto descritto nella issue. (#3458)

Ringraziamo anche i membri della community che hanno segnalato questi problemi su Discord e via email e di cui non abbiamo registrato i nomi.

[Differenze complete su GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

Gran parte della 2.2 è consolidamento. Un utente non amministratore con un ruolo `users:manage` delegato poteva prendere il controllo di un'istanza, e si è scoperto che a ogni endpoint degli strumenti mancava il controllo dei permessi. Aggiorni se gestisce più di un utente.

Il resto è la lunga coda del self-hosting: download che partivano e non finivano mai, preset che si rompevano non appena si aggiungeva un secondo file, container che andavano in crash loop mentre Postgres era ancora in avvio. Sono arrivati anche due nuovi strumenti. La documentazione e il sito web sono ora tradotti in 21 lingue, e l'interfaccia supera finalmente il contrasto WCAG AA.

> [!IMPORTANT]
> Se ha concesso `users:manage` a un utente non amministratore tramite un ruolo personalizzato, quel ruolo poteva prendere il controllo degli account amministratore nelle versioni da 2.0.0 a 2.1.0. Dettagli in Sicurezza.

### Sicurezza {#v2-2-0-security}

- **Escalation di privilegi tramite un ruolo `users:manage` delegato (GHSA-9xgh-95qh-2x7h).** Un utente non amministratore con `users:manage` tramite un ruolo personalizzato poteva reimpostare la password di un account con privilegi più alti, o eliminarlo, amministratore integrato incluso, e prendere il controllo dell'istanza. La reimpostazione della password e l'eliminazione dell'account ora verificano l'autorità del chiamante sul bersaglio, quindi un ruolo delegato non può superare il proprio livello. Interessate: da 2.0.0 a 2.1.0. Segnalato da 李春来 (Chunlai Li). (#616)
- **Ogni endpoint degli strumenti è ora protetto.** L'accesso agli strumenti veniva applicato route per route, quindi tutte le 45 route scritte a mano dovevano ricordarsi la stessa chiamata e nessuna lo faceva. Un ruolo senza `tools:use` poteva comunque eseguire image-to-pdf, erase-object, upscale, sign-pdf e il resto. Il controllo ora risiede in un unico preHandler basato sulla route corrispondente, quindi copre i sotto-percorsi e qualsiasi route aggiunta in futuro. (#646)
- **Il rate limiting era aggirabile nelle installazioni Docker.** L'immagine veniva distribuita con `TRUST_PROXY=true`, quindi l'IP del client proveniva da un header della richiesta e un `X-Forwarded-For` falsificato superava il limitatore del login. Il valore predefinito è ora un elenco di fiducia per reti private. (#649)
- **Le scritture delle impostazioni vengono verificate per singola impostazione**, non una sola volta all'ingresso, e l'importazione della configurazione è ora transazionale, così una chiave rifiutata non può lasciare una configurazione applicata a metà. (#618)
- **I nomi dei file della libreria non possono uscire dalla loro radice di storage.** Un nome memorizzato costruito ad arte, che un'importazione SQLite 1.x malevola copia alla lettera, poteva leggere o eliminare file fuori dalla directory dei file. Raggiungibile solo dopo che un operatore importa un database SQLite 1.x fornito da un attaccante, che è l'unico percorso che permette di scegliere un nome memorizzato. Segnalato da @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **L'annullamento dei job applica la proprietà**, quindi un utente autenticato non può più annullare il job di un altro utente tramite il suo ID. Segnalato da @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Un nuovo audit dell'intero albero 2.0 ha individuato ciò che era ancora aperto**: un'asserzione SAML catturata poteva essere riprodotta, una sfida MFA sopravviveva a qualsiasi numero di codici errati, la ricerca della chiave API a ogni richiesta era una scansione completa della tabella, `MAX_WORKSPACE_SIZE_GB` era una configurazione inerte, e il sanitizzatore SVG lasciava passare href `javascript:` senza virgolette. (#620)
- **Nove CVE divulgate corrette**: fast-uri, svgo, sharp e tar in modo transitivo (#619), più Pillow 12.3.0 (#517). La decodifica RAW su arm64 ora compila LibRaw 0.22.2 dai sorgenti invece di collegarsi a una copia di sistema non corretta. (#649)

### Nuove funzionalità {#v2-2-0-new-features}

- **Ritaglio arrotondato**: maschere a quadrato arrotondato e squircle in stile iOS, con un controllo del raggio degli angoli. Pensato per favicon e icone di app. (#602)
- **Rimuovi sfondo GIF**: elimina lo sfondo da una GIF, WebP o APNG animata fotogramma per fotogramma e restituisce un'animazione trasparente. (#502)
- **Lazo e modalità Alta qualità di Cancella oggetto**: trascini un anello a mano libera invece di dipingere ogni pixel, e installi facoltativamente un bundle di inpainting a diffusione per riempimenti più puliti di aree ampie. (#503, #566)
- **Salva come nuovo, o sovrascrivi.** Modificare un file della libreria sostituiva in silenzio l'originale. Ora sceglie per ogni modifica, e l'impostazione predefinita lo conserva. (#564, #577)
- **Preset di proporzioni in Ridimensiona.** Scelga 1:1, 4:3 o 16:9 e le due dimensioni restano vincolate, senza ingrandimento. (#530)
- **OCR a due livelli**: un livello veloce è incluso nell'immagine e funziona offline senza download, mentre un runtime più accurato si installa su richiesta. (#519)
- **Scriva ovunque per cercare.** Inizi a digitare nella dashboard o nella homepage e il testo finisce nella casella di ricerca. (#644)
- **Documentazione e sito web in 21 lingue**: il sito della documentazione, le pagine landing e il riferimento API sono ora tutti tradotti, e si aggiungono all'interfaccia dell'app. Una nuova guida al deployment a risorse ridotte copre Raspberry Pi e macchine da 2 GB. (#548)
- **Nomi degli strumenti più chiari**: 18 nomi ambigui ora si qualificano da soli, così "Comprimi" è diventato "Comprimi immagine". Gli ID e le route degli strumenti non cambiano, quindi nulla di ciò che ha nei preferiti si rompe. (#520)

### Miglioramenti {#v2-2-0-improvements}

- **Contrasto WCAG AA in tutta l'interfaccia**: la palette è stata rivista in modo che l'arancione vivace resti sui riempimenti mentre testo ed etichette usano token di colore accessibili, e tutti i 57 indicatori di focus ora superano la soglia 3:1 per gli elementi non testuali. (#567, #574)
- **Upscale e rimozione sfondo non sembrano più bloccati**: la barra di avanzamento procede durante l'inferenza invece di fermarsi al 30%, ed entrambi gli strumenti ora avvisano che un host solo CPU è molto più lento. (#605, #608)
- **I messaggi di timeout indicano la causa reale** e tengono conto degli host solo CPU invece di dare la colpa all'upload. (#596)
- **SnapOtter attende Postgres e Redis all'avvio** invece di andare in crash loop, sia in Compose sia nell'immagine all-in-one. Un'installazione Proxmox LXC si riavviava 76 volte prima di questa modifica. (#537, #595)
- **I download sopravvivono a un reverse proxy**: SnapOtter chiede a nginx e ai proxy compatibili di non memorizzare in buffer le risposte dei file, che è il motivo abituale per cui un download self-hosted parte e non finisce mai. (#604, #607)
- **Comprimi PDF arriva vicino alla dimensione target**, e lo dice onestamente quando un target è irraggiungibile. (#522)
- **I controlli degli strumenti su mobile restano raggiungibili** ora che le shell dell'app si dimensionano sul viewport dinamico. (#559)
- **Converti audio espone un'impostazione della frequenza di campionamento.** (#561)
- **Gli amministratori possono ridurre la lunghezza minima della password**, fino a 1 per un'istanza su LAN attendibile. (#543)
- **L'MFA è in autoservizio**, il blocco dovuto alla policy è chiuso, e gli accessi OIDC o SAML ricevono una vera sfida MFA invece di un blocco netto. (#531, #536)
- **Un semplice `Error: Error` ora ne indica la causa.** I fallimenti di codifica di sharp, le uscite del sidecar AI, l'output non JSON del sidecar dei documenti e i fallimenti della rimozione dello sfondo arrivavano tutti con il motivo cancellato. (#532, #534, #535, #538, #612)
- **La finestra di aiuto è tradotta.** Le etichette delle scorciatoie e il testo di introduzione erano in inglese inserito nel codice mentre traduzioni complete restavano inutilizzate in tutti i 21 file delle lingue. (#647)

### Correzioni di bug {#v2-2-0-bug-fixes}

- **I file HEIC da iPhone venivano rifiutati** come illeggibili prima di raggiungere il decoder che li gestisce. (#631)
- **I preset di conversione fallivano al secondo file**: jpg-to-pdf e i suoi fratelli image-to-pdf, più pdf-to-png, pdf-to-jpg e pdf-to-tiff, restituivano tutti `Tool not found` una volta caricati due file. (#633, #643)
- **I preset di conversione PDF perdevano il pulsante di download.** (#629)
- **Un timeout di elaborazione illimitato non veniva rispettato**, e i flussi di avanzamento bloccati ora si riprendono invece di lasciare l'interfaccia in attesa. (#638)
- **I download si bloccavano invece di fallire** quando un file memorizzato risultava più corto della lunghezza registrata. (#617)
- **Gli strumenti per le pagine PDF fallivano su file brevi e cifrati**: Rimuovi pagine usava per impostazione predefinita un intervallo di pagine che nessun documento sotto le sei pagine possiede, e i PDF protetti da password fallivano in modo criptico dentro il worker. (#594)
- **PDF in testo restituiva in silenzio un file vuoto** per i PDF scansionati. Ora La indirizza all'OCR e serve il testo in UTF-8. (#603)
- **PDF in Word perdeva i blocchi di testo colorati** e li divideva sulla pagina. (#500)
- **Cancella oggetto lasciava residui fantasma** e sfocava gli oggetti piccoli nelle immagini ad alta risoluzione. (#501)
- **Stabilizza video scriveva un output non riproducibile** senza faststart. (#593)
- **Riparazioni dell'editor di immagini**: ruota, capovolgi, ridimensiona, livelli, curve, filtri e blocco dei livelli. (#597)
- **Firma PDF mostrava un canvas vuoto** invece di indicare perché un PDF non si caricava. (#545)
- **La libreria di file registrava dimensioni 0x0** e saltava le anteprime per i caricamenti HEIC, RAW e PSD. (#636, #637)
- **Installare più di un bundle AI** lasciava il virtualenv condiviso con più versioni e rompeva in silenzio tre strumenti. (#649)
- **La conversione in JXL con qualità da 1 a 4 restituiva un 500**, e un ffmpeg mancante veniva segnalato come upload corrotto. (#649)
- **Un'interruzione temporanea di Postgres lasciava bloccati i job terminati**, lasciando l'output su disco senza alcuna riga che lo puntasse. Un reconciler ora recupera quel lavoro invece di scartarlo. (#649)
- **Un endpoint Redis che cambiava indirizzo bloccava ogni consumer** mentre i controlli di salute rispondevano ancora 200. (#649)
- **Correzioni a sito web e documentazione**: i link localizzati non perdono più i frammenti `#` né convertono in minuscolo `zh-CN`, la navigazione della documentazione resta nel viewport sui tablet, e nessuno dei due siti chiama più l'API di GitHub dal Suo browser. (#516, #562, #570, #560)

### Note di aggiornamento {#v2-2-0-upgrade-notes}

Nulla da migrare, ma due valori predefiniti distribuiti sono cambiati:

- **`TRUST_PROXY` ora ha come valore predefinito `loopback,linklocal,uniquelocal`** invece di fidarsi di ogni peer. Le reti bridge di Docker e Compose rientrano in questo intervallo, quindi la maggior parte delle configurazioni non richiede modifiche. Se il Suo reverse proxy raggiunge SnapOtter da un indirizzo pubblico, imposti `TRUST_PROXY` esplicitamente, altrimenti rate limiting e audit log attribuiranno ogni richiesta al proxy.
- **`MAX_AI_JOBS_PER_USER` ha come valore predefinito 5** job AI a singolo file in corso per utente. Le esecuzioni AI batch e pipeline restano senza limite.

Nuove opzioni facoltative: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (disattivata per impostazione predefinita) e `GIF_BG_MAX_FRAMES`.

### Ringraziamenti {#v2-2-0-acknowledgements}

Buona parte di questa release è partita dalla segnalazione di un bug di qualcun altro.

Codice e contributi:

- **@mvanhorn** ❤️: Ha riscritto il fallimento per timeout della rimozione sfondo in un messaggio che dice cosa fare, invece di un semplice timeout. (#518, #494)
- **@EuanTop** ❤️: Ha ripristinato l'azione di download nelle pagine dei preset di conversione PDF facendo restituire alla route sincrona il contratto standard del risultato dello strumento. (#629, #623)
- **@harshjainnn** ❤️: Ha diagnosticato il download che parte e non finisce mai, e proposto la direzione del reset del socket su cui è stata costruita la correzione. (#617, #590)

Segnalazioni di sicurezza:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Ha segnalato in privato l'escalation di privilegi tramite un ruolo `users:manage` delegato, con un'analisi completa dalla sorgente al punto di sfruttamento e una catena di exploit funzionante. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Ha segnalato un IDOR autenticato sull'annullamento dei job, e un path traversal nei nomi di file memorizzati della libreria raggiungibile dopo un'importazione SQLite 1.x malevola, con un proof of concept funzionante per ciascuno. (#599, #600)

Segnalazioni di bug:

- **@riz467** ❤️: File HEIC reali di iPhone rifiutati in validazione, con la causa radice individuata nella segnalazione. (#622)
- **@coupej** ❤️: Pagine dei preset PDF bloccate per sempre, e jpg-to-pdf che falliva non appena si aggiungeva un secondo file. Due bug distinti, separati correttamente. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` documentato come illimitato ma limitato a cinque minuti. (#630)
- **@bezibaerchen** ❤️: Converti audio nascondeva l'impostazione della frequenza di campionamento promessa dalla propria descrizione. (#558)
- **@hell-toupee** ❤️: Il bundle OCR accurato che non si installava con un errore `libpaddle`. (#505)
- **@Michael1260** ❤️ e **@And-CSH** ❤️: Hanno confermato in modo indipendente quel fallimento dell'installazione OCR e stabilito che l'estrazione manuale funziona mentre l'installer nell'app no, il che ha ricondotto il bug all'installer. (#505)
- **@TomErnst1972** ❤️: L'attivazione della policy MFA obbligatoria che bloccava un amministratore fuori dalla propria istanza. (#515)
- **@thokich** ❤️: La cancellazione di oggetti che produceva riempimenti sfocati e inutilizzabili, il che ha motivato sia la riscrittura dell'inpainting HD sia il bundle facoltativo ad alta qualità. (#141)
- **@Hennie-git** ❤️: Un'installazione Proxmox LXC che si riavviava 76 volte contro un Postgres che non accettava ancora connessioni. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Ha fatto il triage di quella segnalazione in tempo reale e prodotto la diagnosi su cui è stata costruita la correzione dell'avvio. (#537)

Richieste di funzionalità e feedback:

- **@LECOQQ** ❤️: Ha chiesto di allentare la complessità delle password su un'installazione per home server. (#136)
- **@killervette42** ❤️: Ha chiesto una Community App per Unraid, ora pubblicata nello store Unraid CA. (#96)
- **@alienatedsec** ❤️: Ha fatto notare che la correzione del fallback da GPU a CPU era sepolta in una issue chiusa e impossibile da trovare, motivo per cui ora è nella documentazione di deployment. (#490, #587)
- **@neilp316** ❤️: Ha confermato il guasto della GPU Blackwell su una RTX 5060 e tracciato un percorso funzionante di aggiornamento a CUDA 12.8. (#120)
- **@Roiki11** ❤️: Ha sostenuto lo storage condiviso con riferimenti di percorso al posto del trasferimento di file via HTTP per il calcolo AI fuori dalla macchina. (#189)

Ringraziamo anche i membri della community che hanno segnalato questi problemi su Discord e via email e di cui non abbiamo registrato i nomi: la richiesta del ritaglio squircle (#602), il download da image-to-PDF che partiva e non finiva mai (#604, #607), lo strumento Elimina pagine che si bloccava (#594), il testo arabo mancante in pdf-to-text (#603) e la diagnosi alla base del fallback GPU di ONNX (#490).

[Differenze complete su GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 trasforma il toolkit per immagini in una suite completa per la manipolazione di file: oltre 200 strumenti su cinque modalità (Immagini, Video, Audio, PDF e File), ricostruita su Postgres 17 e su una coda di job basata su Redis, con un `docker run` a singolo comando. È una release major; legga le Modifiche incompatibili prima di aggiornare dalla 1.x.

### Nuove funzionalità {#new-features}

- **Quattro nuove modalità di strumenti**: Video, Audio, PDF e File si affiancano a Immagini, portando il catalogo a oltre 200 strumenti.
- **Job in background durevoli**: Una coda basata su Redis (BullMQ) esegue ogni strumento come job tracciato con avanzamento SSE in tempo reale.
- **Modalità all-in-one a singolo container**: Un unico `docker run` avvia un'istanza completa con Postgres e Redis embedded.
- **Bundle AI su richiesta**: Rimozione dello sfondo, OCR, trascrizione, upscaling, rilevamento e miglioramento dei volti, cancellazione di oggetti, colorazione e restauro di foto si installano dall'interfaccia. L'accelerazione GPU viene rilevata per ogni framework.
- **Firma PDF**: Disegni, digiti o carichi una firma e la posizioni su un PDF nel browser.
- **Automate**: Un costruttore visuale di pipeline che concatena gli strumenti, con nove template predefiniti.
- **83 preset di conversione con un clic**: Convertitori dedicati come JPG in PNG, MP4 in GIF e simili, con ricerca fuzzy.
- **Editor di immagini a livelli**: Un editor basato su Konva in `/editor` con pennelli, forme, regolazioni, filtri e curve.
- **Libreria File**: Salvi qualsiasi risultato e lo riutilizzi come input per un altro strumento.
- Strumenti fissati, zoom e panoramica nel canvas, 21 lingue e funzionalità enterprise (OIDC/SSO, SAML, SCIM, storage S3, permessi per singolo strumento, esportazione dell'audit, tracing distribuito).

### Miglioramenti {#improvements}

- Annullamento di un processo in esecuzione. (#137)
- Decodifica RAW a piena risoluzione tramite LibRaw, incluso DNG. (#289)
- Deployment non-root e con UID esterno (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Rilevamento accurato dell'installazione AI e flusso di installazione rafforzato. (#214, #352)
- Rafforzamento della privacy: nessun traffico automatico verso terze parti, più una modalità facoltativa strict-offline.
- Pulsante di feedback sempre attivo, anche con analytics disattivato.

### Correzioni di bug {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` disattiva di nuovo il rate limiting per le route degli strumenti. (#271)
- Riparati i percorsi del virtualenv AI nell'immagine Docker. (#390)
- Compatibilità con sharp 0.35.2+. (#362)
- Correzioni al layout dell'editor di immagini: righelli, comportamento del riempimento, barra laterale e dimensioni del canvas. (#258, #259)
- Completata la traduzione italiana. (#231, #206, #425)
- Normalizzazione audio e loudnorm mantengono la frequenza di campionamento della sorgente.
- Rafforzamento SSRF: confronto CIDR IPv6 numerico e pre-scansione degli URL ampliata. (#287)
- I PDF generati riportano SnapOtter come Producer.
- mediapipe si installa su Python 3.13 e Debian 13.

### Modifiche incompatibili {#breaking-changes}

La 2.0 sostituisce il database SQLite embedded con Postgres 17 e aggiunge Redis 8 per la coda dei job. I dati della 1.x vengono migrati automaticamente al primo avvio, ma lo stack di container è cambiato, quindi faccia prima il backup dell'intero volume `/data` (la 1.x usa SQLite in modalità WAL, quindi i dati confermati risiedono di solito in `snapotter.db-wal`). Poi scelga l'immagine a singolo container (Postgres e Redis embedded, solo root) oppure lo stack Compose (app più Postgres 17 e Redis 8). Vedere la [guida alla migrazione](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) e la [guida all'aggiornamento](/it/guide/upgrading).

### Aggiornamento {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Oppure con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Differenze complete su GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nuovo strumento HTML in immagine, accessibilità WCAG 2.2 AA, rafforzamento della sicurezza dopo i penetration test e 5 correzioni critiche per Docker.

### Nuove funzionalità {#new-features-1}

- **HTML in immagine**: Cattura screenshot di URL o HTML grezzo come PNG/JPEG/WebP. Acquisizioni a pagina intera, viewport personalizzati, modalità scura.
- **Convenzione _FILE di Docker per i segreti**: Monti le variabili d'ambiente sensibili come file invece che in chiaro. (#205)
- **Licenze enterprise e storage S3**: Chiave di licenza commerciale facoltativa e storage a oggetti compatibile con S3.
- **Miglioramenti all'editor di forme**: Trasparenza di riempimento/contorno, selettore colore RGBA, stili di linea tratteggiata.
- **Archivi di release precompilati**: Scarichi i tarball dalle GitHub Releases per le installazioni senza Docker (Proxmox, bare metal, LXC). (#202)

### Miglioramenti {#improvements-1}

- **Accessibilità WCAG 2.2 AA**: Salto della navigazione, focus trapping, regioni aria-live, supporto per la riduzione del movimento, rapporti di contrasto corretti. (#209)
- **Adattamento al mobile**: Impostazioni responsive, riconnessione automatica SSE al cambio di scheda su mobile. (#203, #204)
- **Qualità della rimozione dello sfondo**: Smussatura dei bordi, decontaminazione del colore, scelta del formato di output.
- **Traduzione italiana**: ~145 nuove stringhe di @albanobattistella. (#206)
- **Documentazione API per singolo strumento**: 53 pagine con parametri, esempi e formati di risposta.
- **Download dei modelli AI**: Logica di retry con backoff esponenziale per HuggingFace. (#201)

### Correzioni di bug {#bug-fixes-1}

- I container Docker nuovi erano completamente inutilizzabili (il rate limit bloccava tutte le richieste).
- Gli strumenti AI di rilevamento dei volti (blur-faces, red-eye-removal, enhance-faces, passport-photo) fallivano su tutte le piattaforme.
- File HEIC non funzionanti su ARM (mancata corrispondenza dei simboli di libheif).
- I bundle AI di upscale e restore-photo non si installavano su ARM.
- L'OCR usava la versione CUDA sbagliata sui container GPU.
- Bypass del controllo SSRF tramite indirizzi IPv6 mappati IPv4 esadecimali. (Merito: @tonghuaroot)
- Decodifica HEIC di iPhone con immagini ausiliarie. (#183, #199)
- OOM CUDA di Real-ESRGAN su GPU da 8 GB. (#200)
- 6 errori Sentry di produzione e 7 bug emersi in QA. (#208)

### Sicurezza {#security}

- Risolti 10 risultati dei penetration test (bypass XFF, crash da JSON malformato, pipeline illimitate, XSS nell'audit log, metodo TRACE e altro). (#207)
- Bloccato il bypass SSRF tramite IPv6 esadecimale. (Merito: @tonghuaroot)
- Immagini base del Dockerfile fissate tramite digest.

### Aggiornamento {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Oppure con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Differenze complete su GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Demo dal vivo, pagine landing per singolo strumento e una serie di correzioni di rifinitura.

### Nuove funzionalità {#new-features-2}

- **Demo dal vivo** - [demo.snapotter.com](https://demo.snapotter.com) permette di provare SnapOtter senza installare nulla.
- **Pagina indice degli strumenti** - Sfogli più di 50 strumenti in `/tools` con ricerca e filtri per categoria.
- **Più di 50 pagine landing SEO** - Ogni strumento ha ora una pagina dedicata con FAQ, casi d'uso e tabelle di confronto.
- **Anteprima dello sfondo** - Il cursore prima/dopo mostra uno sfondo a scacchi dietro le immagini trasparenti.
- **Generatore di password sicure** - Pulsante con un clic nel modulo Aggiungi membri.

### Correzioni di bug {#bug-fixes-2}

- Lo strumento info per HEIC/HEIF non fallisce più (aggiunta la pre-decodifica).
- L'installazione dei bundle dei modelli AI mostra messaggi di errore migliori e rispetta i limiti di risorse.
- Le miniature della libreria si caricano correttamente (mancavano gli header di autenticazione).
- I menu a discesa non vengono più tagliati nelle tabelle delle impostazioni Persone e Team.
- La percentuale di confronto delle dimensioni è nascosta negli strumenti che non comprimono.
- Rimosso il link duplicato all'informativa sulla privacy.
- Aggiunta la traduzione italiana per le impostazioni delle funzioni AI.
- Aggiornate le icone Lucide rinominate (Wand2, Columns).

### Infrastruttura {#infrastructure}

- OpenSSF Scorecard rafforzato da 4,3 a circa 7,0.
- I test CI sono stati parallelizzati in 4 shard con fixture ridimensionate.
- 41 aggiornamenti di dipendenze.

### Aggiornamento {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Oppure con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Differenze complete su GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Cinque nuovi strumenti, un editor di immagini completo, login SSO, 20 lingue. Probabilmente avrebbero dovuto essere tre release separate, ma eccoci qui.

### Nuove funzionalità {#new-features-3}

- **Editor di immagini** - Livelli, pennelli, forme, regolazioni, filtri, curve, scorciatoie da tastiera. Funziona nel Suo browser, elabora sul Suo hardware.
- **Autenticazione OIDC / SSO** - Acceda con Google, GitHub, Okta o qualsiasi provider OpenID Connect. Imposti alcune variabili d'ambiente e il Suo team usa gli account che ha già.
- **Generatore di meme** - 100 template integrati con rendering del testo tramite opentype.js. Oppure carichi una Sua immagine.
- **Beautify** - Inserisca uno screenshot, ottenga un'immagine rifinita. Cornici di dispositivo (macOS, Windows, browser), ombre, gradienti, preset per i social media.
- **Simulazione del daltonismo** - Veda in anteprima come appaiono le immagini con protanopia, deuteranopia, tritanopia e altre carenze della visione dei colori.
- **Correzione della trasparenza PNG** - Rileva i PNG finti trasparenti e li corregge con BiRefNet HR-matting. Rimozione facoltativa della filigrana tramite inpainting LaMa.
- **Espansione del canvas con AI** - Estende i bordi dell'immagine con riempimento AI. Tre livelli di qualità (veloce, bilanciato, qualità) a seconda di quanto tempo GPU vuole scambiare.
- **20 lingue** - Arabo, cinese (semplificato/tradizionale), ceco, olandese, francese, tedesco, hindi, indonesiano, italiano, giapponese, coreano, polacco, portoghese, russo, spagnolo, thailandese, turco, ucraino, vietnamita. L'RTL funziona per l'arabo.
- **Importazione da URL** - Incolli gli URL nella dropzone o li importi in blocco da un elenco. Download lato server con protezione SSRF.
- **Cancellazione multi-file** - Disegni maschere di cancellazione su più immagini, le elabori tutte con un clic. I tratti persistono per immagine.
- **Importazione/esportazione delle pipeline** - Salvi le catene di strumenti come JSON e le condivida con altri.
- **17 nuovi formati RAW di fotocamera** tramite exiftool, più input QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ e APNG. Nuovi codec di output per BMP, ICO, JP2, QOI. L'esportazione in AVIF, TIFF, GIF, JXL e PSD è stata recuperata da un branch precedentemente perso.

### Miglioramenti {#improvements-2}

- **Miglioramento delle immagini** - Sostituita la vecchia pipeline con CLAHE + normalise + gamma. Il nuovo interruttore Deep Enhance usa il modello AI per risultati più aggressivi.
- **Restauro foto** - Rilevamento dei graffi riscritto con filtraggio Otsu a 8 angoli. L'inpainting LaMa ora funziona alla risoluzione nativa.
- **Formati esotici ovunque** - OCR, image-to-PDF, generatore di favicon, composizione, stitch e vectorize ora decodificano HEIC, RAW e PSD.
- **Comprimi** - La tolleranza della dimensione target ridotta dal 5% all'1%. La dimensione target è la modalità predefinita. Aggiunti i pulsanti stepper e il selettore di unità KB/MB.
- **Pulizia di Sentry** - 644 eventi non azionabili filtrati. Gli errori reali ora sono gestiti correttamente.
- **Rilevamento GPU** - Diagnostica migliore per i container in cui CUDA è presente ma nvidia-smi no.
- **Modalità con autenticazione disattivata** - L'utente anonimo viene inserito nel DB con ruolo admin. Chiavi API, pipeline e file utente non si rompono più sui vincoli FK.
- **Oltre 2.705 nuovi test** tra unit, integration ed E2E.

### Correzioni di bug {#bug-fixes-3}

- L'upscale su CPU non va più in timeout su NAS e hardware a basso consumo.
- Il logo del codice QR non fa più sparire definitivamente l'anteprima.
- Corretto l'overflow del ritaglio per immagini verticali alte.
- I file TIFF con alfa forzano correttamente l'output PNG invece di produrre corruzione.
- La decodifica HDR/EXR converte a 8 bit prima di CLAHE, risolvendo i fallimenti di decodifica.
- I buffer di input dei landmark facciali vengono convertiti in PNG prima del sidecar Python, risolvendo i crash.
- Trova duplicati gestisce batch con formati misti ed errori di rete.
- L'anteprima di Beautify si aggiorna in tempo reale.
- Barre di avanzamento per stitch e vectorize.
- SVGZ gestito da SVG-to-raster.
- Nomi di file non ASCII corretti tramite l'header X-File-Results codificato in percent-encoding.

### Aggiornamento {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Oppure con Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Differenze complete su GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Immagine Docker unificata con rilevamento automatico della GPU. Un'unica immagine gestisce sia i carichi CPU sia GPU. Compose semplificato in un unico file con rotazione dei log. I pre-download dei modelli ora includono verifica e uno smoke test.

---

## v1.13.0 {#v1-13-0}

Controllo degli accessi basato sui ruoli (RBAC). 14 permessi granulari, tre ruoli integrati (admin, editor, user), supporto ai ruoli personalizzati. Controlli dei permessi su tutte le route API. Schede del frontend filtrate in base ai permessi dell'utente.

---

## v1.12.0 {#v1-12-0}

Strumento PDF in immagine. Converta le pagine PDF in PNG, JPEG, WebP o TIFF a DPI personalizzati. Immagine Docker unificata con rilevamento automatico della GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt generato automaticamente tramite vitepress-plugin-llms per una documentazione adatta all'AI.

---

## v1.10.0 {#v1-10-0}

Ridimensionamento content-aware (seam carving) con protezione dei volti. Ridimensioni le immagini preservando i contenuti importanti.

---

## v1.9.0 {#v1-9-0}

Strumento Stitch / Combina. Unisca le immagini affiancate, impilate in verticale o in una griglia personalizzata.

---

## v1.8.0 {#v1-8-0}

Strumento Modifica metadati. Visualizzi e modifichi i metadati EXIF, IPTC e XMP con un'interfaccia granulare di rimozione/conservazione.

---

## Release precedenti {#older-releases}

Per il changelog completo a livello di commit, comprese le patch release, vedere [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
