---
description: "Note di rilascio e cronologia delle versioni di SnapOtter. Scopri le novità, i miglioramenti e le correzioni di ogni release."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: 45f516cf811f
---

# Changelog {#changelog}

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
