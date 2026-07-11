---
description: "Riferimento completo dell'API REST. Endpoint degli strumenti, elaborazione batch, pipeline, libreria file, autenticazione, team e operazioni di amministrazione."
i18n_source_hash: 8646977f7cc9
i18n_provenance: machine
i18n_output_hash: 1fa1fec30f47
---

# Riferimento dell'API REST {#rest-api-reference}

La documentazione interattiva dell'API con esempi di richiesta/risposta è disponibile su [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Specifiche leggibili dalla macchina:
- `/api/v1/openapi.yaml` - specifica OpenAPI 3.1
- `/llms.txt` - riepilogo adatto agli LLM
- `/llms-full.txt` - documentazione completa adatta agli LLM

## Autenticazione {#authentication}

Tutti gli endpoint richiedono l'autenticazione a meno che `AUTH_ENABLED=false`.

### Token di sessione {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

Le sessioni scadono dopo 7 giorni (configurabile tramite `SESSION_DURATION_HOURS`).

### Chiavi API {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

Le chiavi hanno il prefisso `si_` e sono memorizzate come hash scrypt: la chiave grezza viene mostrata una sola volta e non è più recuperabile.

### Endpoint di autenticazione {#auth-endpoints}

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Pubblico | Accesso, ottieni il token di sessione |
| `POST` | `/api/auth/logout` | Auth | Distruggi la sessione corrente |
| `GET` | `/api/auth/session` | Auth | Convalida la sessione corrente |
| `POST` | `/api/auth/change-password` | Auth | Cambia la propria password (invalida tutte le altre sessioni + chiavi API) |
| `GET` | `/api/auth/users` | Admin | Elenca tutti gli utenti |
| `POST` | `/api/auth/register` | Admin | Crea un nuovo utente |
| `PUT` | `/api/auth/users/:id` | Admin | Aggiorna il ruolo o il team dell'utente |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Reimposta la password dell'utente |
| `DELETE` | `/api/auth/users/:id` | Admin | Elimina un utente |
| `GET` | `/api/v1/config/auth` | Pubblico | Verifica se l'autenticazione è abilitata (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Auth | Avvia l'iscrizione all'MFA TOTP. Richiede la funzionalità enterprise `mfa` |
| `POST` | `/api/auth/mfa/verify` | Auth | Conferma l'iscrizione all'MFA con un codice TOTP |
| `POST` | `/api/auth/mfa/complete` | Pubblico | Completa una richiesta di accesso MFA in sospeso |
| `POST` | `/api/auth/mfa/disable` | Auth | Disabilita l'MFA per l'utente corrente |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | Reimposta l'MFA per un utente |
| `GET` | `/api/auth/oidc/login` | Pubblico | Avvia l'accesso OIDC quando OIDC è abilitato |
| `GET` | `/api/auth/oidc/callback` | Pubblico | Callback di autorizzazione OIDC |
| `GET` | `/api/auth/saml/metadata` | Pubblico | XML dei metadati SAML SP quando SAML è abilitato |
| `GET` | `/api/auth/saml/login` | Pubblico | Avvia l'accesso SAML |
| `POST` | `/api/auth/saml/callback` | Pubblico | Servizio consumer delle asserzioni SAML |

Quando l'MFA è abilitato per un utente, `POST /api/auth/login` restituisce `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` invece di un token di sessione. Invia quel `mfaToken` più un codice TOTP o di recupero a `/api/auth/mfa/complete`.

### Permessi {#permissions}

| Permesso | Admin | Utente |
|-----------|:-----:|:----:|
| Usare gli strumenti | ✓ | ✓ |
| File/pipeline/chiavi API propri | ✓ | ✓ |
| Vedere file/pipeline/chiavi di tutti gli utenti | ✓ | - |
| Scrivere le impostazioni | ✓ | - |
| Gestire utenti e team | ✓ | - |
| Gestire il branding | ✓ | - |

## Controllo dello stato {#health-check}

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Pubblico | Controllo di base dello stato. Restituisce `{"status":"healthy","version":"..."}` con 200, oppure `{"status":"unhealthy"}` con 503 se il database non è raggiungibile. |
| `GET` | `/api/v1/readyz` | Pubblico | Sonda di prontezza. Verifica PostgreSQL, Redis, lo spazio su disco e S3 quando configurato. Restituisce 503 quando l'istanza non dovrebbe ricevere traffico. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Diagnostica dettagliata che include uptime, modalità di archiviazione, stato del database, stato della coda e disponibilità della GPU. |

## Utilizzo degli strumenti {#using-tools}

Ogni strumento segue lo stesso schema:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>` è uno tra `image`, `video`, `audio`, `pdf` o `files`.

- Il caricamento è `multipart/form-data`.
- `settings` è una stringa JSON con opzioni specifiche dello strumento.
- `clientJobId` è un campo del modulo facoltativo per la correlazione dell'avanzamento fornita dal chiamante.
- `fileId` è un campo del modulo facoltativo che fa riferimento a un elemento esistente della libreria file. Quando presente, l'output elaborato viene salvato come nuova versione e la risposta include `savedFileId`.
- **Strumenti veloci** in genere restituiscono JSON 200: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Recupera il file elaborato da `downloadUrl`.
- **Qualsiasi strumento in coda** può restituire JSON 202 se è di lunga durata o supera la finestra di attesa sincrona: `{"jobId":"...","async":true}`. Connettiti a SSE per l'avanzamento, quindi scarica al completamento (vedi [Tracciamento dell'avanzamento](#progress-tracking)).
- Le route **batch** restituiscono un archivio ZIP trasmesso direttamente in streaming (con l'header `X-Job-Id`) per gli strumenti registrati nel registro batch generico.

## Riferimento degli strumenti {#tools-reference}

### Preset di conversione {#conversion-presets}

Il catalogo condiviso include 83 endpoint dedicati ai preset di conversione, come `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` e `excel-to-csv`. I preset sono route degli strumenti di prima classe:

`POST /api/v1/tools/<section>/<presetId>`

Ogni preset blocca il formato di output e delega a uno strumento di base come `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` o `convert-spreadsheet`. Vedi [Preset di conversione](/it/tools/conversion-presets) per la tabella completa delle route e le impostazioni facoltative.

### Elementi essenziali {#essentials}

| ID strumento | Nome | Impostazioni principali |
|---------|------|-------------|
| `resize` | Ridimensiona | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, più 23 preset per i social media |
| `crop` | Ritaglia | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | Ruota e capovolgi | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Converti | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Comprimi | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Ottimizzazione {#optimization}

| ID strumento | Nome | Impostazioni principali |
|---------|------|-------------|
| `optimize-for-web` | Ottimizza per il web | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Rimuovi metadati | - |
| `edit-metadata` | Modifica metadati | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Rinomina in blocco | `pattern` (supporta `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Immagine in PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Generatore di favicon | `padding`, `backgroundColor`, `borderRadius` - genera tutte le dimensioni standard |

### Regolazioni {#adjustments}

| ID strumento | Nome | Impostazioni principali |
|---------|------|-------------|
| `adjust-colors` | Regola i colori | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Nitidezza | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Sostituisci colore | `sourceColor`, `targetColor` (sostituzione), `makeTransparent`, `tolerance` |
| `color-blindness` | Simulazione del daltonismo | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, predefinito "deuteranomaly") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixelizza | `blockSize` (2-128), `region` ({left, top, width, height} per la pixelizzazione parziale) |
| `vignette` | Vignettatura | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Strumenti AI {#ai-tools}

Tutti gli strumenti AI vengono eseguiti sul tuo hardware: CPU per impostazione predefinita, oppure NVIDIA CUDA quando è disponibile una GPU NVIDIA supportata. L'accelerazione tramite iGPU Intel/AMD attraverso VA-API, Quick Sync o OpenCL non è attualmente supportata per l'inferenza AI. Nessuna connessione a internet richiesta.

| ID strumento | Nome | Modello AI | Impostazioni principali |
|---------|------|---------|-------------|
| `remove-background` | Rimuovi sfondo | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Upscaling immagini | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Gomma per oggetti | LaMa (ONNX) | Maschera inviata come secondo file part (fieldname `mask`), `format`, `quality` |
| `ocr` | OCR / Estrazione del testo | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Sfocatura volti / PII | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Ritaglio intelligente | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Miglioramento immagini | Basato sull'analisi | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Miglioramento volti | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | Colorizzazione AI | DDColor | `intensity`, `model` |
| `noise-removal` | Rimozione del rumore | Riduzione del rumore a livelli | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Rimozione occhi rossi | Punti di riferimento del volto + analisi del colore | `sensitivity`, `strength` |
| `restore-photo` | Restauro foto | Pipeline multi-fase | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Foto tessera | Punti di riferimento MediaPipe | Flusso in due fasi. L'analisi usa multipart `file`; la generazione usa JSON con `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), punti di riferimento, dimensioni dell'immagine |
| `content-aware-resize` | Ridimensionamento sensibile al contenuto | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Correttore di trasparenza PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Sostituzione sfondo | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Sfoca sfondo | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | Espansione tela AI | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Filigrana e sovrapposizione {#watermark-overlay}

| ID strumento | Nome | Impostazioni principali |
|---------|------|-------------|
| `watermark-text` | Filigrana di testo | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Filigrana di immagine | `opacity`, `position`, `scale` - il secondo file è la filigrana |
| `text-overlay` | Sovrapposizione di testo | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Composizione di immagini | `x`, `y`, `opacity`, `blend` - il secondo file viene sovrapposto |
| `meme-generator` | Generatore di meme | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Supporta la modalità template (corpo JSON con `templateId`) o la modalità immagine personalizzata (multipart con file). |

### Utilità {#utilities}

| ID strumento | Nome | Impostazioni principali |
|---------|------|-------------|
| `info` | Info immagine | - (restituisce width, height, format, size, channels, hasAlpha, DPI, EXIF) |
| `compare` | Confronta immagini | `mode` (side-by-side/overlay/diff), `diffThreshold` - il secondo file è la destinazione del confronto |
| `find-duplicates` | Trova duplicati | `threshold` (distanza dell'hash percettivo, predefinito 8) - multi-file |
| `color-palette` | Palette di colori | `count` (numero di colori dominanti), `format` (hex/rgb) |
| `qr-generate` | Generatore di codici QR | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (file facoltativo) |
| `barcode-read` | Lettore di codici a barre | - (rileva automaticamente QR, EAN, Code128, DataMatrix, ecc.) |
| `image-to-base64` | Immagine in Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML in immagine | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Istogramma | `scale` (linear/log) - restituisce il grafico dell'istogramma RGB + statistiche per canale |
| `lqip-placeholder` | Segnaposto LQIP | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Generatore di codici a barre | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Corpo JSON, nessun caricamento di file. |

### Layout e composizione {#layout-composition}

| ID strumento | Nome | Impostazioni principali |
|---------|------|-------------|
| `collage` | Collage / Griglia | `template` (25+ layout), `gap`, `backgroundColor`, `borderRadius` - multi-file |
| `stitch` | Unisci / Combina | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - multi-file |
| `split` | Divisione immagini | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Bordo e cornice | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Abbellisci screenshot | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Ritaglio circolare | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Spaziatura immagine | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Foglio sprite | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - multi-file (2-64 immagini) |

### Formato e conversione {#format-conversion}

| ID strumento | Nome | Impostazioni principali |
|---------|------|-------------|
| `svg-to-raster` | SVG in raster | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Immagine in SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | Strumenti GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), parametri specifici dell'azione |
| `gif-webp` | Convertitore GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Strumenti video {#video-tools}

| ID strumento | Nome | Impostazioni principali |
|---------|------|-------------|
| `convert-video` | Converti video | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Comprimi video | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Taglia video | `startS`, `endS`, `precise` (bool, taglio preciso al frame) |
| `mute-video` | Silenzia video | - |
| `video-to-gif` | Video in GIF | `fps` (1-30), `width`, `startS`, `durationS` (max 60s) |
| `resize-video` | Ridimensiona video | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Ritaglia video | `width`, `height`, `x`, `y` |
| `rotate-video` | Ruota video | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Cambia FPS | `fps` (1-120) |
| `video-color` | Colore video | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Velocità video | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Inverti video | - (max 5 minuti) |
| `video-loudnorm` | Normalizza audio | - (EBU R128) |
| `aspect-pad` | Spaziatura proporzioni | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Spaziatura sfocata | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Filigrana video | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Stabilizza video | `smoothing` (5-60, in frame) |
| `gif-to-video` | GIF in video | `format` (mp4/webm/mov) |
| `video-to-webp` | Video in WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Video in frame | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Unisci video | - (multi-file, normalizzato alla risoluzione del primo video) |
| `replace-audio` | Sostituisci audio | - (file video + audio, due file) |
| `burn-subtitles` | Incorpora sottotitoli | `fontSize` (8-72) - file video + sottotitoli |
| `embed-subtitles` | Integra sottotitoli | `language` (codice ISO 639-2/B) - file video + sottotitoli |
| `extract-subtitles` | Estrai sottotitoli | - (produce SRT) |
| `images-to-video` | Immagini in video | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - multi-file |
| `video-metadata` | Pulisci metadati video | - |
| `auto-subtitles` | Sottotitoli automatici (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Estrai audio | `format` (mp3/wav/m4a/ogg) |

### Strumenti audio {#audio-tools}

| ID strumento | Nome | Impostazioni principali |
|---------|------|-------------|
| `convert-audio` | Converti audio | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Taglia audio | `startS`, `endS` |
| `volume-adjust` | Regola volume | `gainDb` (-30 a 30) |
| `normalize-audio` | Normalizza audio | - (EBU R128, -16 LUFS) |
| `fade-audio` | Dissolvenza audio | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Inverti audio | - |
| `audio-speed` | Velocità audio | `factor` (0.25-4) |
| `pitch-shift` | Cambio di tonalità | `semitones` (-12 a 12) |
| `audio-channels` | Canali audio | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Rimozione del silenzio | `thresholdDb` (-80 a -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Riduzione del rumore | `strength` (light/medium/strong) |
| `merge-audio` | Unisci audio | `format` (mp3/wav/flac/m4a) - multi-file |
| `split-audio` | Dividi audio | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Creatore di suonerie | `startS`, `durationS` (1-30) |
| `waveform-image` | Immagine della forma d'onda | `width`, `height`, `color` (hex) |
| `audio-metadata` | Metadati audio | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Trascrivi audio (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Strumenti per documenti {#document-tools}

| ID strumento | Nome | Impostazioni principali |
|---------|------|-------------|
| `merge-pdf` | Unisci PDF | - (multi-file, fino a 20 PDF) |
| `split-pdf` | Dividi PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Comprimi PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Ruota PDF | `angle` (90/180/270), `range` (intervallo di pagine) |
| `extract-pages` | Estrai pagine | `range` (sintassi qpdf, es. "1-5,8,10-z") |
| `remove-pages` | Rimuovi pagine | `pages` (intervallo qpdf da rimuovere) |
| `organize-pdf` | Organizza PDF | `order` (ordine delle pagine qpdf, es. "3,1,2,5-z") |
| `protect-pdf` | Proteggi PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Sblocca PDF | `password` |
| `repair-pdf` | Ripara PDF | - |
| `linearize-pdf` | Ottimizza PDF per il web | - (linearizza per una visualizzazione web veloce) |
| `grayscale-pdf` | PDF in scala di grigi | - |
| `pdfa-convert` | Converti in PDF/A | - (PDF/A-2 di archiviazione) |
| `crop-pdf` | Ritaglia PDF | `margin` (0-2000 punti) |
| `nup-pdf` | PDF N-up | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | PDF opuscolo | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Filigrana PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Numeri di pagina PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Appiattisci PDF | - (integra moduli e annotazioni) |
| `redact-pdf` | Oscura PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Firma PDF | Route multipart personalizzata con PDF `file`, file di firma `sig0`, `sig1` e array JSON `placements` |
| `pdf-to-text` | PDF in testo | - |
| `pdf-to-word` | PDF in Word | - |
| `pdf-metadata` | Metadati PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Converti documento | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Converti presentazione | `format` (pptx/odp) |
| `convert-spreadsheet` | Converti foglio di calcolo | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel in PDF | - |
| `word-to-pdf` | Word in PDF | - |
| `powerpoint-to-pdf` | PowerPoint in PDF | - |
| `html-to-pdf` | HTML in PDF | - (risorse remote disabilitate) |
| `markdown-to-docx` | Markdown in Word | - |
| `markdown-to-html` | Markdown in HTML | - |
| `markdown-to-pdf` | Markdown in PDF | - (risorse remote disabilitate) |
| `epub-convert` | Converti EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Converti in EPUB | - (accetta .docx, .md, .html, .txt) |
| `ocr-pdf` | OCR PDF (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF in immagine | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF in JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF in PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF in TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Strumenti per file {#file-tools}

| ID strumento | Nome | Impostazioni principali |
|---------|------|-------------|
| `chart-maker` | Creatore di grafici | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV in Excel | `sheet` (numero del foglio di lavoro per l'input XLSX) - bidirezionale |
| `csv-json` | CSV in JSON | `pretty` (bool) - bidirezionale |
| `json-xml` | JSON in XML | `pretty` (bool) - bidirezionale |
| `split-csv` | Dividi CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Unisci CSV | - (multi-file, colonne corrispondenti) |
| `yaml-json` | YAML / JSON | - (bidirezionale) |
| `xml-to-csv` | XML in CSV | - (individua automaticamente gli elementi ripetuti) |
| `excel-to-csv` | Excel in CSV | preset di conversione dedicato supportato da `convert-spreadsheet` |
| `create-zip` | Crea ZIP | - (multi-file, 2-50 file) |
| `extract-zip` | Estrai ZIP | - (protetto da zip bomb) |

### HTML in immagine {#html-to-image}

Cattura una pagina web come immagine. A differenza degli altri strumenti, questo endpoint accetta `application/json` invece dei dati del modulo multipart (nessun caricamento di file necessario).

**Endpoint:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `url` | string | (obbligatorio) | URL da catturare (solo http/https) |
| `format` | string | `"png"` | Formato di output: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Qualità 1-100 (solo JPG/WebP) |
| `fullPage` | boolean | `false` | Cattura l'intera pagina scorrevole |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Larghezza personalizzata del viewport 320-3840 |
| `viewportHeight` | number | `720` | Altezza personalizzata del viewport 320-2160 |

**Esempio:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Risposta:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Sotto-route degli strumenti {#tool-sub-routes}

Alcuni strumenti espongono endpoint aggiuntivi oltre alla `POST /api/v1/tools/<section>/<toolId>` standard:

| Metodo | Percorso | Descrizione |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Restituisce gli ID degli strumenti più popolari, ricorrendo a un elenco predefinito curato quando i dati di utilizzo sono scarsi |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Applica effetti di sfondo (color/gradient/blur/shadow) senza rieseguire l'AI. Usa la maschera memorizzata nella cache dalla rimozione iniziale. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Legge i metadati EXIF/IPTC/XMP esistenti da un'immagine |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Ispeziona i campi dei metadati prima della rimozione |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Fase 1: rilevamento AI del volto + rimozione dello sfondo. Restituisce i punti di riferimento del volto e i dati memorizzati nella cache. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Fase 2: ritaglio, ridimensionamento e affiancamento usando l'analisi memorizzata nella cache. Nessuna riesecuzione dell'AI. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Ottiene i metadati della GIF (numero di frame, dimensioni, durata) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Ottiene i metadati del PDF (numero di pagine, dimensioni) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Genera un'anteprima di una pagina PDF specifica |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Ottiene i metadati del PDF per il preset JPG dedicato |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Genera un'anteprima di una pagina PDF con preset JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Ottiene i metadati del PDF per il preset PNG dedicato |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Genera un'anteprima di una pagina PDF con preset PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Ottiene i metadati del PDF per il preset TIFF dedicato |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Genera un'anteprima di una pagina PDF con preset TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Converte in batch più SVG in raster |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Analizza la qualità dell'immagine e restituisce raccomandazioni di miglioramento |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Anteprima leggera per la regolazione dei parametri in tempo reale. Restituisce l'immagine ottimizzata con gli header delle dimensioni. |

## Elaborazione batch {#batch-processing}

Applica uno strumento generico abilitato al batch a più file contemporaneamente. Restituisce un archivio ZIP. Le route personalizzate multi-file o multi-fase, come la firma dei PDF, l'OCR dei PDF e le route dei preset da PDF a immagine, usano il proprio contratto di endpoint invece della route generica `/batch`.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

La concorrenza è controllata da `CONCURRENT_JOBS` (predefinito: rilevato automaticamente dai core della CPU). `MAX_BATCH_SIZE` limita il numero di file per batch (predefinito: 100; imposta 0 per illimitato).

## Pipeline {#pipelines}

### Esegui una pipeline {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

L'output di ogni fase è l'input della fase successiva. Le pipeline consentono 20 fasi per impostazione predefinita, configurabili tramite `MAX_PIPELINE_STEPS`. Imposta `MAX_PIPELINE_STEPS=0` per rimuovere il limite.

### Salva e gestisci le pipeline {#save-and-manage-pipelines}

| Metodo | Percorso | Descrizione |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Salva una pipeline con nome (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Elenca le pipeline salvate (gli amministratori vedono tutte; gli utenti vedono le proprie) |
| `DELETE` | `/api/v1/pipeline/:id` | Elimina (proprietario o amministratore) |
| `GET` | `/api/v1/pipeline/tools` | Elenca gli ID degli strumenti validi per le fasi della pipeline |

## Tracciamento dell'avanzamento {#progress-tracking}

I job di lunga durata, gli strumenti in coda, i job batch e le pipeline emettono l'avanzamento in tempo reale tramite Server-Sent Events. Lo stream di avanzamento è pubblico e indicizzato per ID del job, quindi i client non devono inviare un header Authorization per leggerlo.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Formato dell'evento:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Puoi richiedere l'annullamento di un job in coda o in esecuzione con `POST /api/v1/jobs/:jobId/cancel`. La risposta è `{"canceled":true|false}`.

## Libreria file {#file-library}

Archiviazione persistente dei file con cronologia delle versioni.

| Metodo | Percorso | Descrizione |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Carica i file nello spazio di lavoro (elaborazione temporanea) |
| `POST` | `/api/v1/files/upload` | Carica i file nella libreria file persistente |
| `POST` | `/api/v1/files/save-result` | Salva il risultato dell'elaborazione di uno strumento come nuova versione del file |
| `GET` | `/api/v1/files` | Elenca i file salvati (paginato, con ricerca) |
| `GET` | `/api/v1/files/:id` | Ottiene i metadati del file + la catena delle versioni |
| `GET` | `/api/v1/files/:id/download` | Scarica il file |
| `GET` | `/api/v1/files/:id/thumbnail` | Ottiene una miniatura JPEG da 300px |
| `DELETE` | `/api/v1/files` | Elimina in blocco i file e le loro catene di versioni (corpo: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Recupera URL remoti nello spazio di lavoro per importazioni basate su URL |
| `POST` | `/api/v1/preview` | Genera un'anteprima WebP compatibile con il browser (per i formati HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Trasmette in streaming un'anteprima compatibile con il browser, memorizzata nella cache o generata, per un file PDF, documento office, video o audio salvato |
| `POST` | `/api/v1/preview/generate` | Genera un'anteprima MP4 o MP3 su richiesta per un file multimediale caricato senza salvarlo prima |
| `GET` | `/api/v1/download/:jobId/:filename` | Scarica un file elaborato da uno spazio di lavoro |

Per salvare automaticamente il risultato di uno strumento nella libreria, includi `fileId` come campo del modulo multipart che fa riferimento a un file esistente della libreria. Il risultato elaborato verrà salvato come nuova versione.

## Gestione delle chiavi API {#api-key-management}

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Genera una nuova chiave - mostrata una sola volta |
| `GET` | `/api/v1/api-keys` | Auth | Elenca le chiavi (name, id, lastUsedAt - non la chiave grezza) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Elimina la chiave |

## Team {#teams}

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Elenca i team |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Crea un team |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Rinomina un team |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Elimina un team (non è possibile eliminare il team predefinito o i team con membri) |

## Impostazioni {#settings}

Configurazione runtime a coppie chiave-valore (letta da qualsiasi utente autenticato, scritta solo dagli amministratori).

| Metodo | Percorso | Descrizione |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Ottiene tutte le impostazioni |
| `PUT` | `/api/v1/settings` | Aggiorna in blocco le impostazioni (corpo JSON con coppie chiave-valore) |
| `GET` | `/api/v1/settings/:key` | Ottiene un'impostazione specifica per chiave |

Chiavi note: `disabledTools` (array JSON di ID degli strumenti), `enableExperimentalTools` (stringa bool), `loginAttemptLimit` (numero).

## Preferenze {#preferences}

Le preferenze per utente sono separate dalle impostazioni dell'istanza. Qualsiasi utente autenticato può leggere e aggiornare la propria mappa di preferenze.

| Metodo | Percorso | Descrizione |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Ottiene le preferenze dell'utente corrente come `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Inserisce o aggiorna una o più chiavi di preferenza per l'utente corrente |

## Ruoli {#roles}

Gestione dei ruoli personalizzati con permessi granulari.

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Elenca tutti i ruoli con il conteggio degli utenti |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Crea un ruolo personalizzato (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Aggiorna un ruolo personalizzato (non è possibile modificare i ruoli integrati) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Elimina un ruolo personalizzato (non è possibile eliminare i ruoli integrati; gli utenti interessati tornano al ruolo `user`) |

Permessi disponibili (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Registro di controllo {#audit-log}

Endpoint riservato agli amministratori per esaminare le azioni rilevanti per la sicurezza.

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Registro di controllo paginato con filtri facoltativi |

Parametri della query:

| Parametro | Descrizione |
|-----------|-------------|
| `page` | Numero di pagina (predefinito: 1) |
| `limit` | Voci per pagina (predefinito: 50, max: 100) |
| `action` | Filtra per tipo di azione (es. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Filtra per indirizzo IP di origine |
| `from` | Filtra le voci dopo questa data ISO 8601 |
| `to` | Filtra le voci prima di questa data ISO 8601 |

## Analytics {#analytics}

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Pubblico | Ottiene la configurazione analytics effettiva (chiave PostHog, DSN Sentry, sample rate). Le chiavi, il DSN e l'ID dell'istanza sono vuoti quando gli analytics sono disattivati, sia dal bake in fase di compilazione sia dall'impostazione dell'istanza `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Auth | Invia un feedback utente esplicito al progetto PostHog configurato come `feedback_submitted`. La route rispetta il gate degli analytics, limita la frequenza degli invii, rimuove i campi di contatto a meno che `contactOk` non sia true e non accetta mai contenuti di file, nomi di file, percorsi di caricamento o testo grezzo di errori privati. Quando gli analytics sono disabilitati, restituisce `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Imposta l'opt-out a livello di istanza. Invia un corpo JSON `{ "analyticsEnabled": "false" }` per disattivare gli analytics per tutti, oppure `"true"` per riattivarli. |

## Funzionalità / Bundle AI {#features-ai-bundles}

Gestisci i bundle delle funzionalità AI (installa/disinstalla i pacchetti dei modelli AI nell'ambiente Docker). Preferisci l'endpoint di installazione a livello di strumento quando abiliti uno strumento da un'automazione personalizzata: alcuni strumenti AI necessitano di più di un bundle condiviso, e questo endpoint salta i bundle già installati mettendo in coda solo quelli mancanti.

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | Elenca tutti i bundle delle funzionalità e il loro stato di installazione |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Installa un bundle di funzionalità (asincrono, restituisce `jobId` per il tracciamento dell'avanzamento) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Admin (`features:manage`) | Installa ogni bundle richiesto da uno strumento; restituisce lo stato per bundle in coda/saltato |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Disinstalla un bundle di funzionalità e pulisce i file dei modelli |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Ottiene l'utilizzo totale del disco dei modelli AI |
| `POST` | `/api/v1/admin/features/import` | Admin (`features:manage`) | Importa un archivio di bundle AI offline |

## Operazioni di amministrazione {#admin-operations}

Endpoint operativi per l'osservabilità, il supporto, la reportistica sull'utilizzo e lo stato dei backup.

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Legge il livello di log runtime corrente |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Cambia il livello di log runtime (`fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Metriche Prometheus in formato testo |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Scarica un bundle ZIP di supporto diagnostico oscurato |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Dati della dashboard di utilizzo, con parametro della query `days` facoltativo |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Legge i metadati dell'ultimo backup e lo stato di freschezza |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Registra un backup completato (`type`, `sizeBytes` facoltativo, `notes` facoltativo) |

## API Enterprise {#enterprise-apis}

Queste route sono soggette a licenza in base alla loro funzionalità enterprise correlata. Richiedono comunque il permesso SnapOtter elencato.

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Esporta le voci del registro di controllo come JSON o CSV con filtri |
| `GET` | `/api/v1/enterprise/config/export` | Admin (`system:health`) | Esporta la configurazione dell'istanza oscurata, i ruoli personalizzati e i team |
| `POST` | `/api/v1/enterprise/config/import` | Admin (`system:health`) | Importa la configurazione, con esecuzione a vuoto facoltativa |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Legge l'allowlist CIDR configurata |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Aggiorna l'allowlist CIDR con prevenzione dell'autoesclusione |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Elenca i blocchi legali di utenti e team |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Applica o rilascia un blocco legale su un utente o un team |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Genera un token bearer SCIM, restituito una sola volta |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Revoca il token bearer SCIM corrente |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Legge la configurazione dell'inoltro SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Aggiorna la configurazione dell'inoltro SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Elenca le destinazioni dei webhook |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Crea una destinazione webhook |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Aggiorna una destinazione webhook |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Elimina una destinazione webhook |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Invia un payload webhook di prova |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Avvia un job di esportazione utente GDPR |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | Legge lo stato dell'esportazione GDPR e l'URL di download |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Elimina definitivamente i dati di un utente dopo conferma |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Elimina definitivamente i dati di un team dopo conferma |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | Legge i metadati di versione dell'app, della build, di Node e dello schema |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | Confronta le migrazioni impacchettate con quelle applicate |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Esegue i controlli di prontezza all'aggiornamento |

### SCIM 2.0 {#scim-2-0}

Gli endpoint di discovery SCIM sono pubblici. Gli endpoint di utenti e gruppi richiedono il token bearer SCIM generato sopra.

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Pubblico | Capacità del server SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Pubblico | Discovery dello schema SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Pubblico | Discovery del tipo di risorsa SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Token SCIM | Elenca gli utenti, con filtro SCIM facoltativo |
| `POST` | `/api/v1/scim/v2/Users` | Token SCIM | Crea un utente |
| `GET` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Ottiene un utente |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Sostituisce un utente |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Disattiva in modo soft un utente |
| `GET` | `/api/v1/scim/v2/Groups` | Token SCIM | Elenca i team come gruppi SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Token SCIM | Crea un team |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Ottiene un team |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Sostituisce un team e l'appartenenza al gruppo |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Elimina un team |

## Template dei meme {#meme-templates}

API di supporto per lo strumento generatore di meme.

| Metodo | Percorso | Accesso | Descrizione |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | Elenca tutti i template di meme disponibili con le posizioni delle caselle di testo |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Serve l'immagine del template a grandezza naturale |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Serve la miniatura del template |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Serve il file del font usato per il rendering del testo del meme |

## Risposte di errore {#error-responses}

Tutti gli errori restituiscono JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Stato | Significato |
|--------|---------|
| 400 | Richiesta non valida / convalida fallita |
| 401 | Non autenticato |
| 403 | Permessi insufficienti |
| 404 | Risorsa non trovata |
| 413 | File troppo grande (vedi `MAX_UPLOAD_SIZE_MB`) |
| 422 | Elaborazione fallita dopo la convalida |
| 429 | Frequenza limitata (vedi `RATE_LIMIT_PER_MIN`) |
| 501 | Il bundle della funzionalità AI richiesto non è installato (`FEATURE_NOT_INSTALLED`) |
| 500 | Errore interno del server |
