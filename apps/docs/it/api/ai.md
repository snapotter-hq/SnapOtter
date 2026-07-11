---
description: "Riferimento del motore AI con tutti gli strumenti ML locali. Rimozione dello sfondo, upscaling, OCR, rilevamento dei volti, restauro fotografico e altro ancora."
i18n_source_hash: 14728c1dcd05
i18n_provenance: machine
i18n_output_hash: 306a1e2df486
---

# Riferimento del motore AI {#ai-engine-reference}

Il pacchetto `@snapotter/ai` fa da ponte tra Node.js e un **sidecar Python persistente** per tutte le operazioni ML. Il processo dispatcher resta attivo tra una richiesta e l'altra per garantire prestazioni rapide con avvio a caldo. NVIDIA CUDA viene rilevata automaticamente all'avvio e usata quando disponibile; in caso contrario gli strumenti AI vengono eseguiti su CPU.

Oggi l'accelerazione tramite iGPU Intel/AMD con VA-API, Quick Sync o OpenCL non è supportata per l'inferenza AI. Mappare `/dev/dri` in un container non accelera questi strumenti del sidecar Python a meno che non sia disponibile una GPU NVIDIA compatibile con CUDA.

19 strumenti AI del sidecar Python distribuiti su quattro modalità (immagine, audio, video, documento), più 2 strumenti con funzionalità AI opzionali. Tutti i modelli vengono eseguiti in locale, senza bisogno di connessione a internet dopo il download iniziale del modello.

## Architettura {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

Un profilo dispatcher "docs" separato sostituisce l'allowlist AI con script per l'elaborazione dei documenti (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) e salta gli import ML pesanti.

**Timeout:** 300 s di default; OCR e rimozione dello sfondo con BiRefNet ottengono 600 s.

## Bundle di funzionalità {#feature-bundles}

I modelli AI sono raggruppati per stack di dipendenze condivise, non con un archivio per ogni strumento. Un bundle di funzionalità può abilitare più strumenti quando questi usano la stessa famiglia di modelli, gli stessi wheel Python o le stesse librerie native. Questo mantiene più piccola l'immagine Docker di rilascio ed evita di conservare copie duplicate degli stessi modelli di matting dello sfondo, rilevamento dei volti, OCR, restauro e riconoscimento vocale.

L'immagine Docker include l'applicazione più il runtime comune. Gli archivi di modelli di grandi dimensioni vengono scaricati su richiesta nel volume persistente `/data/ai`, poi riutilizzati da ogni strumento che ne ha bisogno. Se un bundle è già installato perché un altro strumento ne aveva bisogno, abilitare un nuovo strumento dipendente non scarica di nuovo quel bundle.

Ogni strumento AI richiede uno o più bundle di funzionalità prima di poter essere eseguito. La UI di amministrazione installa per strumento tramite `POST /api/v1/admin/tools/:toolId/features/install`, che risolve l'elenco completo dei bundle, salta quelli già installati e mette in coda solo i download mancanti. Ad esempio, abilitare Passport Photo su un'istanza nuova mette in coda `background-removal` e `face-detection`; abilitarlo dopo che Background Removal è già installato mette in coda solo `face-detection`.

| Bundle | Dimensione | Gruppo di dipendenze condivise | Strumenti che lo usano |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / matting dello sfondo BiRefNet | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | rilevamento dei volti e landmark MediaPipe | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | inpainting/outpainting LaMa e DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, denoising | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | pipeline di riparazione dei graffi e restauro | restore-photo |
| `ocr` | 5-6 GB | stack OCR PaddleOCR / Tesseract | ocr, ocr-pdf |
| `transcription` | ~600 MB | modelli speech-to-text faster-whisper | transcribe-audio, auto-subtitles |

Strumenti con dipendenze tra più bundle:

| Strumento | Bundle richiesti | Perché |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Rimuove lo sfondo, poi usa i landmark del volto per inquadrare il ritaglio secondo le regole delle foto per passaporto e documenti di identità. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Rileva i volti prima di eseguire il miglioramento GFPGAN o CodeFormer sulle regioni facciali selezionate. |

Uno strumento è disponibile solo quando tutti i bundle richiesti sono installati. Le installazioni parziali sono valide e vengono gestite in modo incrementale: i bundle installati vengono riutilizzati, quelli mancanti vengono mostrati come download e le installazioni in coda vengono eseguite una alla volta, così l'ambiente Python condiviso non viene modificato in modo concorrente.

---

## Rimozione dello sfondo {#background-removal}

**Route dello strumento:** `remove-background`  
**Modello:** rembg con BiRefNet (predefinito) o varianti U2-Net

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `model` | string | - | Variante del modello (override opzionale) |
| `backgroundType` | string | `"transparent"` | Uno tra: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Colore esadecimale per lo sfondo pieno |
| `gradientColor1` | string | - | Primo colore del gradiente |
| `gradientColor2` | string | - | Secondo colore del gradiente |
| `gradientAngle` | number | - | Angolo del gradiente in gradi |
| `blurEnabled` | boolean | - | Abilita l'effetto sfocatura dello sfondo |
| `blurIntensity` | number (0-100) | - | Intensità della sfocatura |
| `shadowEnabled` | boolean | - | Abilita l'ombra proiettata sul soggetto |
| `shadowOpacity` | number (0-100) | - | Opacità dell'ombra |
| `outputFormat` | string | - | Formato di output: `png`, `webp` o `avif` |
| `edgeRefine` | integer (0-3) | - | Livello di rifinitura dei bordi |
| `decontaminate` | boolean | - | Rimuove le sbavature di colore dai bordi |

## Sostituzione dello sfondo {#background-replace}

**Route dello strumento:** `background-replace`  
**Modello:** rembg / BiRefNet (condiviso con remove-background)

Rimuove lo sfondo e lo sostituisce con un colore pieno o un gradiente.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Modalità sfondo |
| `color` | string | `"#ffffff"` | Colore esadecimale dello sfondo (quando `backgroundType` è `color`) |
| `gradientColor1` | string | - | Primo colore esadecimale del gradiente |
| `gradientColor2` | string | - | Secondo colore esadecimale del gradiente |
| `gradientAngle` | integer (0-360) | `180` | Angolo del gradiente in gradi |
| `feather` | integer (0-20) | `0` | Raggio di sfumatura dei bordi |
| `format` | `"png"` \| `"webp"` | `"png"` | Formato di output |

## Sfocatura dello sfondo {#blur-background}

**Route dello strumento:** `blur-background`  
**Modello:** rembg / BiRefNet (condiviso con remove-background)

Sfoca lo sfondo mantenendo nitido il soggetto.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Intensità della sfocatura |
| `feather` | integer (0-20) | `0` | Raggio di sfumatura dei bordi |
| `format` | `"png"` \| `"webp"` | `"png"` | Formato di output |

## Upscaling delle immagini {#image-upscaling}

**Route dello strumento:** `upscale`  
**Modello:** RealESRGAN (con fallback Lanczos quando non disponibile)

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Fattore di upscaling |
| `model` | string | `"auto"` | Variante del modello |
| `faceEnhance` | boolean | `false` | Applica un passaggio di miglioramento dei volti GFPGAN |
| `denoise` | number | `0` | Intensità del denoising |
| `format` | string | `"auto"` | Override del formato di output |
| `quality` | number | `95` | Qualità di output (1-100) |

## OCR / Estrazione del testo {#ocr-text-extraction}

**Route dello strumento:** `ocr`  
**Modelli:** Tesseract (veloce), PaddleOCR PP-OCRv5 (bilanciato), PaddleOCR-VL 1.5 (migliore)

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Livello di elaborazione |
| `language` | string | `"auto"` | Lingua: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Pre-elabora l'immagine per migliorare la precisione dell'OCR |
| `engine` | string | - | Deprecato. Mappa `tesseract` su `fast`, `paddleocr` su `balanced` |

Restituisce risultati strutturati con riquadri di delimitazione, punteggi di confidenza e blocchi di testo estratti.

## OCR di PDF {#pdf-ocr}

**Route dello strumento:** `ocr-pdf`  
**Modelli:** Stesso sistema a livelli dell'OCR delle immagini

Estrae il testo dai documenti PDF scansionati usando l'OCR basato su AI, pagina per pagina.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Livello di elaborazione |
| `language` | string | `"auto"` | Lingua: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Selezione delle pagine: `"all"`, `"1-3"`, `"1,3,5"` |

## Sfocatura di volti / PII {#face-pii-blur}

**Route dello strumento:** `blur-faces`  
**Modello:** rilevamento dei volti MediaPipe

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Raggio della sfocatura gaussiana |
| `sensitivity` | number (0-1) | `0.5` | Soglia di confidenza del rilevamento |

## Miglioramento dei volti {#face-enhancement}

**Route dello strumento:** `enhance-faces`  
**Modelli:** GFPGAN, CodeFormer

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Modello di miglioramento |
| `strength` | number (0-1) | `0.8` | Intensità del miglioramento |
| `sensitivity` | number (0-1) | `0.5` | Soglia di rilevamento dei volti |
| `onlyCenterFace` | boolean | `false` | Migliora solo il volto più centrale |

## Colorizzazione AI {#ai-colorization}

**Route dello strumento:** `colorize`  
**Modello:** DDColor (con fallback DNN OpenCV)

Converte in pieno colore le foto in bianco e nero o in scala di grigi.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Intensità della saturazione del colore |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Variante del modello |

## Rimozione del rumore {#noise-removal}

**Route dello strumento:** `noise-removal`  
**Modello:** SCUNet (pipeline di denoising a livelli)

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Livello di elaborazione |
| `strength` | number (0-100) | `50` | Intensità del denoising |
| `detailPreservation` | number (0-100) | `50` | Quanto dettaglio preservare; valori più alti mantengono più texture |
| `colorNoise` | number (0-100) | `30` | Intensità della riduzione del rumore cromatico |
| `format` | string | `"original"` | Formato di output: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Qualità di codifica dell'output |

## Rimozione degli occhi rossi {#red-eye-removal}

**Route dello strumento:** `red-eye-removal`

Rileva i landmark del volto, individua le regioni degli occhi e corregge la sovrasaturazione del canale rosso.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Soglia di rilevamento dei pixel rossi |
| `strength` | number (0-100) | `70` | Intensità della correzione |
| `format` | string | - | Override del formato di output (opzionale) |
| `quality` | number (1-100) | `90` | Qualità di output |

## Restauro fotografico {#photo-restoration}

**Route dello strumento:** `restore-photo`

Pipeline multi-step per foto vecchie o danneggiate: rilevamento e riparazione di graffi/strappi, miglioramento dei volti, denoising e colorizzazione opzionale.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Rileva e ripara graffi e strappi |
| `faceEnhancement` | boolean | `true` | Applica un passaggio di miglioramento dei volti |
| `fidelity` | number (0-1) | `0.7` | Intensità del miglioramento dei volti (più alto = più conservativo) |
| `denoise` | boolean | `true` | Applica un passaggio di denoising |
| `denoiseStrength` | number (0-100) | `25` | Intensità del denoising |
| `colorize` | boolean | `false` | Colorizza dopo il restauro |
| `colorizeStrength` | number (0-100) | `85` | Intensità della colorizzazione |

## Foto per passaporto {#passport-photo}

**Route dello strumento:** `passport-photo`  
**Modelli:** landmark del volto MediaPipe + rimozione dello sfondo BiRefNet

Flusso di lavoro in due fasi: analisi (rilevamento del volto + rimozione dello sfondo) poi generazione (ritaglio, ridimensionamento, disposizione a griglia). Supporta oltre 37 paesi in 6 regioni.

### Fase 1: Analisi {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Accetta un file immagine (multipart). Restituisce i dati dei landmark del volto, un'anteprima base64 e le dimensioni dell'immagine.

### Fase 2: Generazione {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Accetta un corpo JSON con i risultati della Fase 1 più le impostazioni di generazione:

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `jobId` | string | (obbligatorio) | ID del job dalla Fase 1 |
| `filename` | string | (obbligatorio) | Nome file originale dalla Fase 1 |
| `countryCode` | string | (obbligatorio) | Codice paese ISO (es. `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Tipo di documento |
| `bgColor` | string | `"#FFFFFF"` | Colore esadecimale dello sfondo |
| `printLayout` | string | `"none"` | Layout di stampa: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Dimensione massima del file in KB (0 = nessun limite) |
| `dpi` | number (72-1200) | `300` | DPI di output |
| `customWidthMm` | number | - | Larghezza personalizzata in mm (sovrascrive le specifiche del paese) |
| `customHeightMm` | number | - | Altezza personalizzata in mm (sovrascrive le specifiche del paese) |
| `zoom` | number (0.5-3) | `1` | Fattore di zoom |
| `adjustX` | number | `0` | Regolazione della posizione orizzontale |
| `adjustY` | number | `0` | Regolazione della posizione verticale |
| `landmarks` | object | (obbligatorio) | Landmark dalla Fase 1 |
| `imageWidth` | number | (obbligatorio) | Larghezza dell'immagine dalla Fase 1 |
| `imageHeight` | number | (obbligatorio) | Altezza dell'immagine dalla Fase 1 |

## Cancellazione di oggetti (Inpainting) {#object-erasing-inpainting}

**Route dello strumento:** `erase-object`  
**Modello:** LaMa tramite ONNX Runtime

La maschera viene inviata come **seconda parte del file** (fieldname `mask`), non come base64. I pixel bianchi nella maschera indicano le aree da cancellare. Le impostazioni `format` e `quality` vengono inviate come campi form di primo livello.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `file` | file | (obbligatorio) | Immagine sorgente (multipart) |
| `mask` | file | (obbligatorio) | Immagine della maschera (multipart, fieldname `mask`, bianco = cancella) |
| `format` | string | `"auto"` | Formato di output: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Qualità di output |

Accelerato con CUDA quando è disponibile una GPU NVIDIA.

## Espansione AI della tela {#ai-canvas-expand}

**Route dello strumento:** `ai-canvas-expand`  
**Modello:** outpainting basato su LaMa

Espande la tela di un'immagine in qualsiasi direzione e riempie le nuove aree con contenuti generati dall'AI che corrispondono all'immagine esistente.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Pixel da estendere in alto |
| `extendRight` | integer | `0` | Pixel da estendere a destra |
| `extendBottom` | integer | `0` | Pixel da estendere in basso |
| `extendLeft` | integer | `0` | Pixel da estendere a sinistra |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Livello di qualità |
| `format` | string | `"auto"` | Formato di output: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Qualità di output |

Almeno una direzione di estensione deve essere maggiore di 0.

## Ritaglio intelligente {#smart-crop}

**Route dello strumento:** `smart-crop`  
**Modello:** rilevamento dei volti MediaPipe (solo modalità volto)

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Strategia di ritaglio: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Strategia per la modalità soggetto |
| `width` | integer | - | Larghezza di output |
| `height` | integer | - | Altezza di output |
| `padding` | integer (0-50) | `0` | Percentuale di margine attorno al soggetto |
| `facePreset` | string | `"head-shoulders"` | Inquadratura predefinita quando `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Soglia di rilevamento dei volti |
| `threshold` | integer (0-255) | `30` | Soglia di rilevamento dello sfondo (modalità di rifilatura) |
| `padToSquare` | boolean | `false` | Riempi il risultato rifilato fino a formare un quadrato |
| `padColor` | string | `"#ffffff"` | Colore di sfondo per il riempimento quadrato |
| `targetSize` | integer | - | Dimensione target per l'output con riempimento (pixel) |
| `quality` | integer (1-100) | - | Qualità di output |

I valori legacy di `mode` `attention` e `content` sono accettati e mappati rispettivamente su `subject` e `trim`.

**Preset per i volti:**

| Preset | Ideale per |
|--------|---------|
| `closeup` | Ritratti in primo piano |
| `head-shoulders` | Foto profilo |
| `upper-body` | LinkedIn / formale |
| `half-body` | Busto completo |

## Trascrizione dell'audio {#transcribe-audio}

**Route dello strumento:** `transcribe-audio`  
**Modello:** faster-whisper

Converte il parlato in testo. Supporta i formati di output testo semplice, SRT e VTT.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Lingua: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Formato di output |

## Sottotitoli automatici {#auto-subtitles}

**Route dello strumento:** `auto-subtitles`  
**Modello:** faster-whisper (estrae l'audio dal video, poi lo trascrive)

Genera file di sottotitoli dalla traccia audio di un video.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Lingua: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Formato dei sottotitoli di output |

## Correttore di trasparenza PNG {#png-transparency-fixer}

**Route dello strumento:** `transparency-fixer`  
**Modello:** matting HR BiRefNet (risoluzione 2048x2048)

Corregge i PNG "a falsa trasparenza" in cui lo sfondo è stato rimosso ma ha lasciato bordi frastagliati, aloni o artefatti semi-trasparenti. Usa il modello di matting ad alta risoluzione di BiRefNet per produrre un canale alfa pulito, poi applica un'elaborazione di defringe configurabile per rimuovere la contaminazione cromatica lungo i bordi.

**Catena di fallback OOM:** Se il matting HR BiRefNet supera la memoria disponibile, lo strumento ricade automaticamente su `birefnet-general`, poi su `u2net`.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Intensità del defringe dei bordi per rimuovere la contaminazione cromatica |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Formato dell'immagine di output |
| `removeWatermark` | boolean | `false` | Applica la pre-elaborazione di rimozione della filigrana (filtro mediano) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Strumenti con funzionalità AI opzionali {#tools-with-optional-ai-capabilities}

I seguenti strumenti non sono strumenti del sidecar Python ma usano funzionalità AI quando determinate opzioni sono abilitate.

### Miglioramento delle immagini {#image-enhancement}

**Route dello strumento:** `image-enhancement`  
**Motore:** basato su analisi (istogramma e statistiche di Sharp)

Analizza l'immagine e applica correzioni automatiche per esposizione, contrasto, bilanciamento del bianco, saturazione, nitidezza e rumore. Supporta modalità specifiche per scena.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Modalità scena per la messa a punto delle correzioni |
| `intensity` | number (0-100) | `50` | Intensità complessiva della correzione |
| `corrections.exposure` | boolean | `true` | Applica la correzione dell'esposizione |
| `corrections.contrast` | boolean | `true` | Applica la correzione del contrasto |
| `corrections.whiteBalance` | boolean | `true` | Applica la correzione del bilanciamento del bianco |
| `corrections.saturation` | boolean | `true` | Applica la correzione della saturazione |
| `corrections.sharpness` | boolean | `true` | Applica la correzione della nitidezza |
| `corrections.denoise` | boolean | `true` | Applica il denoising |
| `deepEnhance` | boolean | `false` | Abilita la rimozione AI del rumore tramite SCUNet (richiede il bundle `upscale-enhance`) |

Un endpoint di analisi aggiuntivo è disponibile su `POST /api/v1/tools/image/image-enhancement/analyze` che restituisce le correzioni rilevate senza applicarle.

### Ridimensionamento content-aware (Seam Carving) {#content-aware-resize-seam-carving}

**Route dello strumento:** `content-aware-resize`  
**Motore:** binario Go `caire` (non Python, nessun beneficio dalla GPU)

Ridimensiona in modo intelligente le immagini rimuovendo le cuciture a bassa energia, preservando i contenuti importanti.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `width` | number | - | Larghezza target |
| `height` | number | - | Altezza target |
| `protectFaces` | boolean | `false` | Protegge le regioni facciali rilevate (richiede il bundle `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Pre-sfocatura per il calcolo dell'energia |
| `sobelThreshold` | number (1-20) | `2` | Soglia di sensibilità dei bordi |
| `square` | boolean | `false` | Forza l'output quadrato |
