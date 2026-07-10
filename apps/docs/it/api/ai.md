---
description: "Riferimento del motore AI con tutti gli strumenti ML locali. Rimozione dello sfondo, upscaling, OCR, rilevamento dei volti, restauro delle foto e altro ancora."
i18n_source_hash: dd135f2e9fdb
i18n_provenance: machine
i18n_output_hash: 2d09700b4e60
---

# Riferimento del motore AI {#ai-engine-reference}

Il pacchetto `@snapotter/ai` collega Node.js a un **sidecar Python persistente** per tutte le operazioni ML. Il processo dispatcher rimane attivo tra le richieste per prestazioni rapide con avvio a caldo. NVIDIA CUDA viene rilevato automaticamente all'avvio e usato quando disponibile; altrimenti gli strumenti AI vengono eseguiti su CPU.

L'accelerazione tramite iGPU Intel/AMD attraverso VA-API, Quick Sync o OpenCL non è supportata oggi per l'inferenza AI. Il mapping di `/dev/dri` in un container non accelera questi strumenti del sidecar Python a meno che non sia disponibile una GPU NVIDIA compatibile con CUDA.

19 strumenti AI del sidecar Python su quattro modalità (immagine, audio, video, documento), più 2 strumenti con capacità AI opzionali. Tutti i modelli vengono eseguiti localmente, senza necessità di connessione a internet dopo il download iniziale del modello.

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

Un profilo dispatcher "docs" separato sostituisce la allowlist AI con script di elaborazione dei documenti (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) e salta gli import ML pesanti.

**Timeout:** 300 s predefiniti; l'OCR e la rimozione dello sfondo BiRefNet ottengono 600 s.

## Bundle di funzionalità {#feature-bundles}

Ogni strumento AI richiede l'installazione di un bundle di modelli prima dell'uso. I bundle vengono installati su richiesta tramite l'interfaccia di amministrazione o `install_feature.py`.

| Bundle | Dimensione | Strumenti |
|--------|------|-------|
| `background-removal` | 4-5 GB | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | restore-photo |
| `ocr` | 5-6 GB | ocr, ocr-pdf |
| `transcription` | ~600 MB | transcribe-audio, auto-subtitles |

---

## Rimozione dello sfondo {#background-removal}

**Rotta dello strumento:** `remove-background`  
**Modello:** rembg con BiRefNet (predefinito) o varianti U2-Net

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `model` | string | - | Variante del modello (override opzionale) |
| `backgroundType` | string | `"transparent"` | Uno tra: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Colore esadecimale per sfondo tinta unita |
| `gradientColor1` | string | - | Primo colore del gradiente |
| `gradientColor2` | string | - | Secondo colore del gradiente |
| `gradientAngle` | number | - | Angolo del gradiente in gradi |
| `blurEnabled` | boolean | - | Abilita l'effetto sfocatura dello sfondo |
| `blurIntensity` | number (0-100) | - | Intensità della sfocatura |
| `shadowEnabled` | boolean | - | Abilita l'ombra proiettata sul soggetto |
| `shadowOpacity` | number (0-100) | - | Opacità dell'ombra |
| `outputFormat` | string | - | Formato di output: `png`, `webp` o `avif` |
| `edgeRefine` | integer (0-3) | - | Livello di rifinitura dei bordi |
| `decontaminate` | boolean | - | Rimuovi lo sbordamento di colore dai bordi |

## Sostituzione dello sfondo {#background-replace}

**Rotta dello strumento:** `background-replace`  
**Modello:** rembg / BiRefNet (condiviso con remove-background)

Rimuove lo sfondo e lo sostituisce con un colore tinta unita o un gradiente.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Modalità dello sfondo |
| `color` | string | `"#ffffff"` | Colore esadecimale dello sfondo (quando `backgroundType` è `color`) |
| `gradientColor1` | string | - | Primo colore esadecimale del gradiente |
| `gradientColor2` | string | - | Secondo colore esadecimale del gradiente |
| `gradientAngle` | integer (0-360) | `180` | Angolo del gradiente in gradi |
| `feather` | integer (0-20) | `0` | Raggio di sfumatura dei bordi |
| `format` | `"png"` \| `"webp"` | `"png"` | Formato di output |

## Sfocatura dello sfondo {#blur-background}

**Rotta dello strumento:** `blur-background`  
**Modello:** rembg / BiRefNet (condiviso con remove-background)

Sfoca lo sfondo mantenendo nitido il soggetto.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Intensità della sfocatura |
| `feather` | integer (0-20) | `0` | Raggio di sfumatura dei bordi |
| `format` | `"png"` \| `"webp"` | `"png"` | Formato di output |

## Upscaling delle immagini {#image-upscaling}

**Rotta dello strumento:** `upscale`  
**Modello:** RealESRGAN (con fallback Lanczos quando non disponibile)

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Fattore di upscaling |
| `model` | string | `"auto"` | Variante del modello |
| `faceEnhance` | boolean | `false` | Applica un passaggio di miglioramento dei volti GFPGAN |
| `denoise` | number | `0` | Intensità della riduzione del rumore |
| `format` | string | `"auto"` | Override del formato di output |
| `quality` | number | `95` | Qualità di output (1-100) |

## OCR / Estrazione del testo {#ocr-text-extraction}

**Rotta dello strumento:** `ocr`  
**Modelli:** Tesseract (veloce), PaddleOCR PP-OCRv5 (bilanciato), PaddleOCR-VL 1.5 (migliore)

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Livello di elaborazione |
| `language` | string | `"auto"` | Lingua: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Pre-elabora l'immagine per migliorare la precisione dell'OCR |
| `engine` | string | - | Deprecato. Mappa `tesseract` su `fast`, `paddleocr` su `balanced` |

Restituisce risultati strutturati con riquadri di delimitazione, punteggi di confidenza e blocchi di testo estratti.

## OCR per PDF {#pdf-ocr}

**Rotta dello strumento:** `ocr-pdf`  
**Modelli:** Stesso sistema di livelli dell'OCR per immagini

Estrae il testo da documenti PDF scansionati usando OCR basato su AI, pagina per pagina.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Livello di elaborazione |
| `language` | string | `"auto"` | Lingua: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Selezione delle pagine: `"all"`, `"1-3"`, `"1,3,5"` |

## Sfocatura di volti / dati personali {#face-pii-blur}

**Rotta dello strumento:** `blur-faces`  
**Modello:** rilevamento dei volti MediaPipe

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Raggio della sfocatura gaussiana |
| `sensitivity` | number (0-1) | `0.5` | Soglia di confidenza del rilevamento |

## Miglioramento dei volti {#face-enhancement}

**Rotta dello strumento:** `enhance-faces`  
**Modelli:** GFPGAN, CodeFormer

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Modello di miglioramento |
| `strength` | number (0-1) | `0.8` | Intensità del miglioramento |
| `sensitivity` | number (0-1) | `0.5` | Soglia di rilevamento dei volti |
| `onlyCenterFace` | boolean | `false` | Migliora solo il volto più centrale |

## Colorazione AI {#ai-colorization}

**Rotta dello strumento:** `colorize`  
**Modello:** DDColor (con fallback OpenCV DNN)

Converte foto in bianco e nero o in scala di grigi in immagini a colori pieni.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Intensità della saturazione del colore |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Variante del modello |

## Rimozione del rumore {#noise-removal}

**Rotta dello strumento:** `noise-removal`  
**Modello:** SCUNet (pipeline di denoising a livelli)

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Livello di elaborazione |
| `strength` | number (0-100) | `50` | Intensità del denoising |
| `detailPreservation` | number (0-100) | `50` | Quanto dettaglio preservare; valori più alti mantengono più texture |
| `colorNoise` | number (0-100) | `30` | Intensità della riduzione del rumore di colore |
| `format` | string | `"original"` | Formato di output: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Qualità di codifica dell'output |

## Rimozione degli occhi rossi {#red-eye-removal}

**Rotta dello strumento:** `red-eye-removal`

Rileva i punti di riferimento del volto, individua le regioni degli occhi e corregge la sovrasaturazione del canale rosso.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Soglia di rilevamento dei pixel rossi |
| `strength` | number (0-100) | `70` | Intensità della correzione |
| `format` | string | - | Override del formato di output (opzionale) |
| `quality` | number (1-100) | `90` | Qualità di output |

## Restauro delle foto {#photo-restoration}

**Rotta dello strumento:** `restore-photo`

Pipeline multi-fase per foto vecchie o danneggiate: rilevamento e riparazione di graffi/strappi, miglioramento dei volti, denoising e colorazione opzionale.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Rileva e ripara graffi e strappi |
| `faceEnhancement` | boolean | `true` | Applica un passaggio di miglioramento dei volti |
| `fidelity` | number (0-1) | `0.7` | Intensità del miglioramento dei volti (più alto = più conservativo) |
| `denoise` | boolean | `true` | Applica un passaggio di denoising |
| `denoiseStrength` | number (0-100) | `25` | Intensità del denoising |
| `colorize` | boolean | `false` | Colorizza dopo il restauro |
| `colorizeStrength` | number (0-100) | `85` | Intensità della colorazione |

## Foto tessera {#passport-photo}

**Rotta dello strumento:** `passport-photo`  
**Modelli:** punti di riferimento del volto MediaPipe + rimozione dello sfondo BiRefNet

Flusso di lavoro in due fasi: analisi (rileva il volto + rimuovi lo sfondo) poi generazione (ritaglia, ridimensiona, disponi in griglia). Supporta oltre 37 paesi in 6 regioni.

### Fase 1: Analisi {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Accetta un file immagine (multipart). Restituisce i dati dei punti di riferimento del volto, un'anteprima base64 e le dimensioni dell'immagine.

### Fase 2: Generazione {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Accetta un corpo JSON con i risultati della Fase 1 più le impostazioni di generazione:

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `jobId` | string | (obbligatorio) | ID del job dalla Fase 1 |
| `filename` | string | (obbligatorio) | Nome del file originale dalla Fase 1 |
| `countryCode` | string | (obbligatorio) | Codice paese ISO (ad es. `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Tipo di documento |
| `bgColor` | string | `"#FFFFFF"` | Colore esadecimale dello sfondo |
| `printLayout` | string | `"none"` | Layout di stampa: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Dimensione massima del file in KB (0 = nessun limite) |
| `dpi` | number (72-1200) | `300` | DPI di output |
| `customWidthMm` | number | - | Larghezza personalizzata in mm (sovrascrive la specifica del paese) |
| `customHeightMm` | number | - | Altezza personalizzata in mm (sovrascrive la specifica del paese) |
| `zoom` | number (0.5-3) | `1` | Fattore di zoom |
| `adjustX` | number | `0` | Regolazione della posizione orizzontale |
| `adjustY` | number | `0` | Regolazione della posizione verticale |
| `landmarks` | object | (obbligatorio) | Punti di riferimento dalla Fase 1 |
| `imageWidth` | number | (obbligatorio) | Larghezza dell'immagine dalla Fase 1 |
| `imageHeight` | number | (obbligatorio) | Altezza dell'immagine dalla Fase 1 |

## Cancellazione di oggetti (Inpainting) {#object-erasing-inpainting}

**Rotta dello strumento:** `erase-object`  
**Modello:** LaMa tramite ONNX Runtime

La maschera viene inviata come **seconda parte del file** (nome del campo `mask`), non come base64. I pixel bianchi nella maschera indicano le aree da cancellare. Le impostazioni `format` e `quality` vengono inviate come campi di form di primo livello.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `file` | file | (obbligatorio) | Immagine sorgente (multipart) |
| `mask` | file | (obbligatorio) | Immagine della maschera (multipart, nome del campo `mask`, bianco = cancella) |
| `format` | string | `"auto"` | Formato di output: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Qualità di output |

Accelerato con CUDA quando è disponibile una GPU NVIDIA.

## Espansione AI della tela {#ai-canvas-expand}

**Rotta dello strumento:** `ai-canvas-expand`  
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

**Rotta dello strumento:** `smart-crop`  
**Modello:** rilevamento dei volti MediaPipe (solo modalità volto)

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Strategia di ritaglio: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Strategia per la modalità soggetto |
| `width` | integer | - | Larghezza di output |
| `height` | integer | - | Altezza di output |
| `padding` | integer (0-50) | `0` | Percentuale di spaziatura attorno al soggetto |
| `facePreset` | string | `"head-shoulders"` | Inquadratura preimpostata quando `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Soglia di rilevamento dei volti |
| `threshold` | integer (0-255) | `30` | Soglia di rilevamento dello sfondo (modalità rifilatura) |
| `padToSquare` | boolean | `false` | Riempi il risultato rifilato per renderlo quadrato |
| `padColor` | string | `"#ffffff"` | Colore dello sfondo per il riempimento quadrato |
| `targetSize` | integer | - | Dimensione target per l'output riempito (pixel) |
| `quality` | integer (1-100) | - | Qualità di output |

I valori legacy di `mode` `attention` e `content` sono accettati e mappati rispettivamente su `subject` e `trim`.

**Preset per i volti:**

| Preset | Ideale per |
|--------|---------|
| `closeup` | Primi piani |
| `head-shoulders` | Foto di profilo |
| `upper-body` | LinkedIn / formale |
| `half-body` | Busto intero |

## Trascrivi audio {#transcribe-audio}

**Rotta dello strumento:** `transcribe-audio`  
**Modello:** faster-whisper

Converte il parlato in testo. Supporta i formati di output testo semplice, SRT e VTT.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Lingua: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Formato di output |

## Sottotitoli automatici {#auto-subtitles}

**Rotta dello strumento:** `auto-subtitles`  
**Modello:** faster-whisper (estrae l'audio dal video, poi lo trascrive)

Genera file di sottotitoli dalla traccia audio di un video.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Lingua: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Formato dei sottotitoli di output |

## Correttore di trasparenza PNG {#png-transparency-fixer}

**Rotta dello strumento:** `transparency-fixer`  
**Modello:** BiRefNet HR-matting (risoluzione 2048x2048)

Corregge i PNG "finti trasparenti" in cui lo sfondo è stato rimosso ma ha lasciato frange, aloni o artefatti semi-trasparenti. Usa il modello di matting ad alta risoluzione di BiRefNet per produrre un canale alfa pulito, poi applica un'elaborazione di defringe configurabile per rimuovere la contaminazione di colore lungo i bordi.

**Catena di fallback OOM:** Se BiRefNet HR-matting supera la memoria disponibile, lo strumento ripiega automaticamente su `birefnet-general`, poi su `u2net`.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Intensità del defringe dei bordi per rimuovere la contaminazione di colore |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Formato dell'immagine di output |
| `removeWatermark` | boolean | `false` | Applica la pre-elaborazione di rimozione della filigrana (filtro mediano) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Strumenti con capacità AI opzionali {#tools-with-optional-ai-capabilities}

I seguenti strumenti non sono strumenti del sidecar Python ma usano funzionalità AI quando determinate opzioni sono abilitate.

### Miglioramento delle immagini {#image-enhancement}

**Rotta dello strumento:** `image-enhancement`  
**Motore:** basato sull'analisi (istogramma e statistiche Sharp)

Analizza l'immagine e applica correzioni automatiche per esposizione, contrasto, bilanciamento del bianco, saturazione, nitidezza e rumore. Supporta modalità specifiche per la scena.

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
| `deepEnhance` | boolean | `false` | Abilita la rimozione del rumore AI tramite SCUNet (richiede il bundle `upscale-enhance`) |

Un endpoint di analisi aggiuntivo è disponibile su `POST /api/v1/tools/image/image-enhancement/analyze`, che restituisce le correzioni rilevate senza applicarle.

### Ridimensionamento consapevole del contenuto (Seam Carving) {#content-aware-resize-seam-carving}

**Rotta dello strumento:** `content-aware-resize`  
**Motore:** binario Go `caire` (non Python, nessun vantaggio dalla GPU)

Ridimensiona in modo intelligente le immagini rimuovendo le cuciture a bassa energia, preservando i contenuti importanti.

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `width` | number | - | Larghezza target |
| `height` | number | - | Altezza target |
| `protectFaces` | boolean | `false` | Proteggi le regioni dei volti rilevati (richiede il bundle `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Pre-sfocatura per il calcolo dell'energia |
| `sobelThreshold` | number (1-20) | `2` | Soglia di sensibilità dei bordi |
| `square` | boolean | `false` | Forza l'output quadrato |
