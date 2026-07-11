---
description: "Fullständig REST API-referens. Verktygsslutpunkter, batchbearbetning, pipelines, filbibliotek, autentisering, team och adminåtgärder."
i18n_source_hash: 8646977f7cc9
i18n_provenance: machine
i18n_output_hash: 4756237a0bdc
---

# REST API-referens {#rest-api-reference}

Interaktiva API-dokument med exempel på förfrågningar och svar finns på [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Maskinläsbara specifikationer:
- `/api/v1/openapi.yaml` - OpenAPI 3.1-specifikation
- `/llms.txt` - LLM-vänlig sammanfattning
- `/llms-full.txt` - Fullständiga LLM-vänliga dokument

## Autentisering {#authentication}

Alla slutpunkter kräver autentisering om inte `AUTH_ENABLED=false`.

### Sessionstoken {#session-token}

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

Sessioner löper ut efter 7 dagar (konfigurerbart via `SESSION_DURATION_HOURS`).

### API-nycklar {#api-keys}

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

Nycklar har prefixet `si_` och lagras som scrypt-hashar - den råa nyckeln visas en gång och kan aldrig hämtas igen.

### Autentiseringsslutpunkter {#auth-endpoints}

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Publik | Logga in, hämta sessionstoken |
| `POST` | `/api/auth/logout` | Auth | Förstör aktuell session |
| `GET` | `/api/auth/session` | Auth | Validera aktuell session |
| `POST` | `/api/auth/change-password` | Auth | Byt eget lösenord (ogiltigförklarar alla andra sessioner + API-nycklar) |
| `GET` | `/api/auth/users` | Admin | Lista alla användare |
| `POST` | `/api/auth/register` | Admin | Skapa en ny användare |
| `PUT` | `/api/auth/users/:id` | Admin | Uppdatera användarroll eller team |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Återställ användarens lösenord |
| `DELETE` | `/api/auth/users/:id` | Admin | Ta bort en användare |
| `GET` | `/api/v1/config/auth` | Publik | Kontrollera om autentisering är aktiverad (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Auth | Starta TOTP MFA-registrering. Kräver enterprise-funktionen `mfa` |
| `POST` | `/api/auth/mfa/verify` | Auth | Bekräfta MFA-registrering med en TOTP-kod |
| `POST` | `/api/auth/mfa/complete` | Publik | Slutför en väntande MFA-inloggningsutmaning |
| `POST` | `/api/auth/mfa/disable` | Auth | Inaktivera MFA för aktuell användare |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | Återställ MFA för en användare |
| `GET` | `/api/auth/oidc/login` | Publik | Starta OIDC-inloggning när OIDC är aktiverat |
| `GET` | `/api/auth/oidc/callback` | Publik | OIDC-auktoriseringsåterkallelse |
| `GET` | `/api/auth/saml/metadata` | Publik | SAML SP-metadata-XML när SAML är aktiverat |
| `GET` | `/api/auth/saml/login` | Publik | Starta SAML-inloggning |
| `POST` | `/api/auth/saml/callback` | Publik | SAML assertion consumer service |

När MFA är aktiverat för en användare returnerar `POST /api/auth/login` `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` istället för en sessionstoken. Skicka den `mfaToken` plus en TOTP- eller återställningskod till `/api/auth/mfa/complete`.

### Behörigheter {#permissions}

| Behörighet | Admin | Användare |
|-----------|:-----:|:----:|
| Använda verktyg | ✓ | ✓ |
| Egna filer/pipelines/API-nycklar | ✓ | ✓ |
| Se alla användares filer/pipelines/nycklar | ✓ | - |
| Skriva inställningar | ✓ | - |
| Hantera användare och team | ✓ | - |
| Hantera varumärkesprofil | ✓ | - |

## Hälsokontroll {#health-check}

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Publik | Grundläggande hälsokontroll. Returnerar `{"status":"healthy","version":"..."}` med 200, eller `{"status":"unhealthy"}` med 503 om databasen inte kan nås. |
| `GET` | `/api/v1/readyz` | Publik | Beredskapssond. Kontrollerar PostgreSQL, Redis, diskutrymme och S3 när det är konfigurerat. Returnerar 503 när instansen inte bör ta emot trafik. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Detaljerad diagnostik inklusive drifttid, lagringsläge, databasstatus, kötillstånd och GPU-tillgänglighet. |

## Använda verktyg {#using-tools}

Varje verktyg följer samma mönster:

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

`<section>` är en av `image`, `video`, `audio`, `pdf` eller `files`.

- Uppladdning är `multipart/form-data`.
- `settings` är en JSON-sträng med verktygsspecifika alternativ.
- `clientJobId` är ett valfritt formulärfält för anropar-tillhandahållen förloppskorrelation.
- `fileId` är ett valfritt formulärfält som refererar till ett befintligt objekt i filbiblioteket. När det finns sparas den bearbetade utdatan som en ny version och svaret inkluderar `savedFileId`.
- **Snabba verktyg** returnerar vanligtvis 200 JSON: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Hämta den bearbetade filen från `downloadUrl`.
- **Alla köade verktyg** kan returnera 202 JSON om de är långvariga eller överskrider det synkrona väntefönstret: `{"jobId":"...","async":true}`. Anslut till SSE för förlopp, ladda sedan ner när det är klart (se [Förloppsspårning](#progress-tracking)).
- **Batch**-rutter returnerar ett ZIP-arkiv som strömmas direkt (med `X-Job-Id`-header) för verktyg som är registrerade i det generiska batchregistret.

## Verktygsreferens {#tools-reference}

### Konverteringsförinställningar {#conversion-presets}

Den delade katalogen innehåller 83 dedikerade slutpunkter för konverteringsförinställningar såsom `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` och `excel-to-csv`. Förinställningar är förstklassiga verktygsrutter:

`POST /api/v1/tools/<section>/<presetId>`

Varje förinställning låser utdataformatet och delegerar till ett basverktyg såsom `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` eller `convert-spreadsheet`. Se [Konverteringsförinställningar](/sv/tools/conversion-presets) för den fullständiga rutttabellen och valfria inställningar.

### Grundläggande {#essentials}

| Verktygs-ID | Namn | Nyckelinställningar |
|---------|------|-------------|
| `resize` | Ändra storlek | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, plus 23 förinställningar för sociala medier |
| `crop` | Beskär | `left`, `top`, `width`, `height`, `unit` (px/procent) |
| `rotate` | Rotera och vänd | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Konvertera | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Komprimera | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Optimering {#optimization}

| Verktygs-ID | Namn | Nyckelinställningar |
|---------|------|-------------|
| `optimize-for-web` | Optimera för webben | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Ta bort metadata | - |
| `edit-metadata` | Redigera metadata | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Massomdöp | `pattern` (stöder `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Bild till PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Favicon-generator | `padding`, `backgroundColor`, `borderRadius` - genererar alla standardstorlekar |

### Justeringar {#adjustments}

| Verktygs-ID | Namn | Nyckelinställningar |
|---------|------|-------------|
| `adjust-colors` | Justera färger | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Skärpa | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Ersätt färg | `sourceColor`, `targetColor` (ersättning), `makeTransparent`, `tolerance` |
| `color-blindness` | Simulering av färgblindhet | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, standard "deuteranomaly") |
| `duotone` | Duoton | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixelera | `blockSize` (2-128), `region` ({left, top, width, height} för partiell pixelering) |
| `vignette` | Vinjett | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### AI-verktyg {#ai-tools}

Alla AI-verktyg körs på din hårdvara: CPU som standard, eller NVIDIA CUDA när en stödd NVIDIA-GPU är tillgänglig. Intel/AMD iGPU-acceleration via VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens idag. Ingen internetanslutning krävs.

| Verktygs-ID | Namn | AI-modell | Nyckelinställningar |
|---------|------|---------|-------------|
| `remove-background` | Ta bort bakgrund | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Bilduppskalning | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Objektsudd | LaMa (ONNX) | Mask skickas som andra fildel (fältnamn `mask`), `format`, `quality` |
| `ocr` | OCR / textextraktion | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Ansikts-/PII-oskärpa | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Smart beskärning | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Bildförbättring | Analysbaserad | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Ansiktsförbättring | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | AI-färgläggning | DDColor | `intensity`, `model` |
| `noise-removal` | Brusreducering | Nivåindelad brusreducering | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Borttagning av röda ögon | Ansiktslandmärke + färganalys | `sensitivity`, `strength` |
| `restore-photo` | Fotorestaurering | Flerstegspipeline | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Passfoto | MediaPipe-landmärken | Tvåfasflöde. Analys använder multipart `file`; generering använder JSON med `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), landmärken, bilddimensioner |
| `content-aware-resize` | Innehållsmedveten storleksändring | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | PNG-transparensfixare | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Ersätt bakgrund | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Gör bakgrund oskarp | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | AI-utökning av arbetsyta | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Vattenstämpel och överlägg {#watermark-overlay}

| Verktygs-ID | Namn | Nyckelinställningar |
|---------|------|-------------|
| `watermark-text` | Textvattenstämpel | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Bildvattenstämpel | `opacity`, `position`, `scale` - andra filen är vattenstämpeln |
| `text-overlay` | Textöverlägg | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Bildkomposition | `x`, `y`, `opacity`, `blend` - andra filen läggs som lager överst |
| `meme-generator` | Memgenerator | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Stöder mallläge (JSON-kropp med `templateId`) eller anpassat bildläge (multipart med fil). |

### Verktyg {#utilities}

| Verktygs-ID | Namn | Nyckelinställningar |
|---------|------|-------------|
| `info` | Bildinfo | - (returnerar bredd, höjd, format, storlek, kanaler, hasAlpha, DPI, EXIF) |
| `compare` | Bildjämförelse | `mode` (side-by-side/overlay/diff), `diffThreshold` - andra filen är jämförelsemålet |
| `find-duplicates` | Hitta dubbletter | `threshold` (perceptuellt hash-avstånd, standard 8) - flerfil |
| `color-palette` | Färgpalett | `count` (antal dominanta färger), `format` (hex/rgb) |
| `qr-generate` | QR-kodgenerator | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (valfri fil) |
| `barcode-read` | Streckkodsläsare | - (identifierar automatiskt QR, EAN, Code128, DataMatrix, osv.) |
| `image-to-base64` | Bild till Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML till bild | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histogram | `scale` (linear/log) - returnerar RGB-histogramdiagram + statistik per kanal |
| `lqip-placeholder` | LQIP-platshållare | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Streckkodsgenerator | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). JSON-kropp, ingen filuppladdning. |

### Layout och komposition {#layout-composition}

| Verktygs-ID | Namn | Nyckelinställningar |
|---------|------|-------------|
| `collage` | Kollage / rutnät | `template` (25+ layouter), `gap`, `backgroundColor`, `borderRadius` - flerfil |
| `stitch` | Sy ihop / kombinera | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - flerfil |
| `split` | Bilddelning | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Ram och kant | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Försköna skärmbild | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Cirkelbeskärning | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Bildutfyllnad | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Sprite-ark | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - flerfil (2-64 bilder) |

### Format och konvertering {#format-conversion}

| Verktygs-ID | Namn | Nyckelinställningar |
|---------|------|-------------|
| `svg-to-raster` | SVG till raster | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Bild till SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | GIF-verktyg | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), åtgärdsspecifika parametrar |
| `gif-webp` | GIF/WebP-konverterare | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Videoverktyg {#video-tools}

| Verktygs-ID | Namn | Nyckelinställningar |
|---------|------|-------------|
| `convert-video` | Konvertera video | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Komprimera video | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Trimma video | `startS`, `endS`, `precise` (bool, bildrutenoggrann klippning) |
| `mute-video` | Tysta video | - |
| `video-to-gif` | Video till GIF | `fps` (1-30), `width`, `startS`, `durationS` (max 60s) |
| `resize-video` | Ändra storlek på video | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Beskär video | `width`, `height`, `x`, `y` |
| `rotate-video` | Rotera video | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Ändra FPS | `fps` (1-120) |
| `video-color` | Videofärg | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Videohastighet | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Baklänges video | - (max 5 minuter) |
| `video-loudnorm` | Normalisera ljud | - (EBU R128) |
| `aspect-pad` | Bildförhållandeutfyllnad | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Oskärpeutfyllnad | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Vattenstämpla video | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Stabilisera video | `smoothing` (5-60, i bildrutor) |
| `gif-to-video` | GIF till video | `format` (mp4/webm/mov) |
| `video-to-webp` | Video till WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Video till bildrutor | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Slå ihop videor | - (flerfil, normaliserad till första videons upplösning) |
| `replace-audio` | Ersätt ljud | - (video + ljudfil, två filer) |
| `burn-subtitles` | Bränn in undertexter | `fontSize` (8-72) - video + undertextfil |
| `embed-subtitles` | Bädda in undertexter | `language` (ISO 639-2/B-kod) - video + undertextfil |
| `extract-subtitles` | Extrahera undertexter | - (ger SRT) |
| `images-to-video` | Bilder till video | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - flerfil |
| `video-metadata` | Rensa videometadata | - |
| `auto-subtitles` | Automatiska undertexter (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Extrahera ljud | `format` (mp3/wav/m4a/ogg) |

### Ljudverktyg {#audio-tools}

| Verktygs-ID | Namn | Nyckelinställningar |
|---------|------|-------------|
| `convert-audio` | Konvertera ljud | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Trimma ljud | `startS`, `endS` |
| `volume-adjust` | Justera volym | `gainDb` (-30 till 30) |
| `normalize-audio` | Normalisera ljud | - (EBU R128, -16 LUFS) |
| `fade-audio` | Tona ljud | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Baklänges ljud | - |
| `audio-speed` | Ljudhastighet | `factor` (0.25-4) |
| `pitch-shift` | Tonhöjdsändring | `semitones` (-12 till 12) |
| `audio-channels` | Ljudkanaler | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Ta bort tystnad | `thresholdDb` (-80 till -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Brusreducering | `strength` (light/medium/strong) |
| `merge-audio` | Slå ihop ljud | `format` (mp3/wav/flac/m4a) - flerfil |
| `split-audio` | Dela ljud | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Ringsignalskapare | `startS`, `durationS` (1-30) |
| `waveform-image` | Vågformsbild | `width`, `height`, `color` (hex) |
| `audio-metadata` | Ljudmetadata | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Transkribera ljud (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Dokumentverktyg {#document-tools}

| Verktygs-ID | Namn | Nyckelinställningar |
|---------|------|-------------|
| `merge-pdf` | Slå ihop PDF:er | - (flerfil, upp till 20 PDF:er) |
| `split-pdf` | Dela PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Komprimera PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Rotera PDF | `angle` (90/180/270), `range` (sidintervall) |
| `extract-pages` | Extrahera sidor | `range` (qpdf-syntax, t.ex. "1-5,8,10-z") |
| `remove-pages` | Ta bort sidor | `pages` (qpdf-intervall att ta bort) |
| `organize-pdf` | Ordna PDF | `order` (qpdf-sidordning, t.ex. "3,1,2,5-z") |
| `protect-pdf` | Skydda PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Lås upp PDF | `password` |
| `repair-pdf` | Reparera PDF | - |
| `linearize-pdf` | Webboptimera PDF | - (linjärisera för snabb webbvisning) |
| `grayscale-pdf` | Gråskala-PDF | - |
| `pdfa-convert` | Konvertera till PDF/A | - (arkiverings-PDF/A-2) |
| `crop-pdf` | Beskär PDF | `margin` (0-2000 punkter) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Häftes-PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Vattenstämpla PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | PDF-sidnummer | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Platta ut PDF | - (fixerar formulär och kommentarer) |
| `redact-pdf` | Redigera bort i PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Signera PDF | Anpassad multipart-rutt med PDF `file`, signaturfiler `sig0`, `sig1` och `placements` JSON-array |
| `pdf-to-text` | PDF till text | - |
| `pdf-to-word` | PDF till Word | - |
| `pdf-metadata` | PDF-metadata | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Konvertera dokument | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Konvertera presentation | `format` (pptx/odp) |
| `convert-spreadsheet` | Konvertera kalkylark | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel till PDF | - |
| `word-to-pdf` | Word till PDF | - |
| `powerpoint-to-pdf` | PowerPoint till PDF | - |
| `html-to-pdf` | HTML till PDF | - (fjärresurser inaktiverade) |
| `markdown-to-docx` | Markdown till Word | - |
| `markdown-to-html` | Markdown till HTML | - |
| `markdown-to-pdf` | Markdown till PDF | - (fjärresurser inaktiverade) |
| `epub-convert` | Konvertera EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Konvertera till EPUB | - (accepterar .docx, .md, .html, .txt) |
| `ocr-pdf` | PDF OCR (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF till bild | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF till JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF till PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF till TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Filverktyg {#file-tools}

| Verktygs-ID | Namn | Nyckelinställningar |
|---------|------|-------------|
| `chart-maker` | Diagramskapare | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV till Excel | `sheet` (kalkylbladsnummer för XLSX-indata) - dubbelriktad |
| `csv-json` | CSV till JSON | `pretty` (bool) - dubbelriktad |
| `json-xml` | JSON till XML | `pretty` (bool) - dubbelriktad |
| `split-csv` | Dela CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Slå ihop CSV:er | - (flerfil, matchande kolumner) |
| `yaml-json` | YAML / JSON | - (dubbelriktad) |
| `xml-to-csv` | XML till CSV | - (hittar automatiskt upprepade element) |
| `excel-to-csv` | Excel till CSV | dedikerad konverteringsförinställning som backas upp av `convert-spreadsheet` |
| `create-zip` | Skapa ZIP | - (flerfil, 2-50 filer) |
| `extract-zip` | Extrahera ZIP | - (bombskyddad) |

### HTML till bild {#html-to-image}

Fånga en webbsida som en bild. Till skillnad från andra verktyg accepterar denna slutpunkt `application/json` istället för multipart-formulärdata (ingen filuppladdning behövs).

**Slutpunkt:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `url` | string | (obligatorisk) | URL att fånga (endast http/https) |
| `format` | string | `"png"` | Utdataformat: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Kvalitet 1-100 (endast JPG/WebP) |
| `fullPage` | boolean | `false` | Fånga hela den rullningsbara sidan |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Anpassad visningsområdesbredd 320-3840 |
| `viewportHeight` | number | `720` | Anpassad visningsområdeshöjd 320-2160 |

**Exempel:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Svar:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Verktygsunderrutter {#tool-sub-routes}

Vissa verktyg exponerar ytterligare slutpunkter utöver den vanliga `POST /api/v1/tools/<section>/<toolId>`:

| Metod | Sökväg | Beskrivning |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Returnera populära verktygs-ID:n, med återgång till en kurerad standardlista när användningsdata är gles |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Applicera bakgrundseffekter (color/gradient/blur/shadow) utan att köra AI på nytt. Använder cachad mask från den ursprungliga borttagningen. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Läs befintlig EXIF/IPTC/XMP-metadata från en bild |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Inspektera metadatafält innan borttagning |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Fas 1: AI-ansiktsdetektering + bakgrundsborttagning. Returnerar ansiktslandmärken och cachad data. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Fas 2: Beskär, ändra storlek och panelindela med cachad analys. Ingen ny AI-körning. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Hämta GIF-metadata (antal bildrutor, dimensioner, varaktighet) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Hämta PDF-metadata (antal sidor, dimensioner) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Generera en förhandsvisning av en specifik PDF-sida |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Hämta PDF-metadata för den dedikerade JPG-förinställningen |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Generera en förhandsvisning av en PDF-sida med JPG-förinställning |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Hämta PDF-metadata för den dedikerade PNG-förinställningen |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Generera en förhandsvisning av en PDF-sida med PNG-förinställning |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Hämta PDF-metadata för den dedikerade TIFF-förinställningen |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Generera en förhandsvisning av en PDF-sida med TIFF-förinställning |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Batchkonvertera flera SVG:er till raster |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Analysera bildkvalitet och returnera förbättringsrekommendationer |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Lättviktsförhandsvisning för live-parameterjustering. Returnerar optimerad bild med storleksheaders. |

## Batchbearbetning {#batch-processing}

Applicera ett generiskt batchaktiverat verktyg på flera filer samtidigt. Returnerar ett ZIP-arkiv. Anpassade flerfils- eller flerstegsrutter, såsom PDF-signering, PDF OCR och PDF-till-bild-förinställningsrutter, använder sitt eget slutpunktskontrakt istället för den generiska `/batch`-rutten.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Samtidighet styrs av `CONCURRENT_JOBS` (standard: automatiskt identifierad från CPU-kärnor). `MAX_BATCH_SIZE` begränsar antalet filer per batch (standard: 100; sätt 0 för obegränsat).

## Pipelines {#pipelines}

### Kör en pipeline {#execute-a-pipeline}

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

Varje stegs utdata är nästa stegs indata. Pipelines tillåter 20 steg som standard, konfigurerbart via `MAX_PIPELINE_STEPS`. Sätt `MAX_PIPELINE_STEPS=0` för att ta bort gränsen.

### Spara och hantera pipelines {#save-and-manage-pipelines}

| Metod | Sökväg | Beskrivning |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Spara en namngiven pipeline (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Lista sparade pipelines (admins ser alla; användare ser sina egna) |
| `DELETE` | `/api/v1/pipeline/:id` | Ta bort (ägare eller admin) |
| `GET` | `/api/v1/pipeline/tools` | Lista verktygs-ID:n som är giltiga för pipeline-steg |

## Förloppsspårning {#progress-tracking}

Långvariga jobb, köade verktyg, batchjobb och pipelines sänder realtidsförlopp via Server-Sent Events. Förloppsströmmen är publik och identifieras med jobb-ID, så klienter behöver inte skicka en Authorization-header för att läsa den.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Händelseformat:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Du kan begära avbrytning av ett köat eller körande jobb med `POST /api/v1/jobs/:jobId/cancel`. Svaret är `{"canceled":true|false}`.

## Filbibliotek {#file-library}

Persistent fillagring med versionshistorik.

| Metod | Sökväg | Beskrivning |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Ladda upp filer till arbetsytan (tillfällig bearbetning) |
| `POST` | `/api/v1/files/upload` | Ladda upp filer till det persistenta filbiblioteket |
| `POST` | `/api/v1/files/save-result` | Spara ett verktygsbearbetningsresultat som en ny filversion |
| `GET` | `/api/v1/files` | Lista sparade filer (sidindelat, med sökning) |
| `GET` | `/api/v1/files/:id` | Hämta filmetadata + versionskedja |
| `GET` | `/api/v1/files/:id/download` | Ladda ner fil |
| `GET` | `/api/v1/files/:id/thumbnail` | Hämta 300px JPEG-miniatyr |
| `DELETE` | `/api/v1/files` | Massradera filer och deras versionskedjor (kropp: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Hämta fjärr-URL:er till arbetsytan för URL-baserade importer |
| `POST` | `/api/v1/preview` | Generera en webbläsarkompatibel WebP-förhandsvisning (för HEIC/HEIF/RAW-format) |
| `GET` | `/api/v1/files/:id/preview` | Strömma en cachad eller genererad webbläsarkompatibel förhandsvisning för en sparad PDF, ett Office-dokument, en video- eller ljudfil |
| `POST` | `/api/v1/preview/generate` | Generera en on-demand MP4- eller MP3-förhandsvisning för en uppladdad mediefil utan att spara den först |
| `GET` | `/api/v1/download/:jobId/:filename` | Ladda ner en bearbetad fil från en arbetsyta |

För att automatiskt spara ett verktygsresultat till biblioteket, inkludera `fileId` som ett multipart-formulärfält som refererar till en befintlig biblioteksfil. Det bearbetade resultatet sparas som en ny version.

## Hantering av API-nycklar {#api-key-management}

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Generera ny nyckel - visas en gång |
| `GET` | `/api/v1/api-keys` | Auth | Lista nycklar (name, id, lastUsedAt - inte den råa nyckeln) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Ta bort nyckel |

## Team {#teams}

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Lista team |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Skapa team |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Byt namn på team |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Ta bort team (kan inte ta bort standardteamet eller team med medlemmar) |

## Inställningar {#settings}

Körtidskonfiguration i nyckel-värde-format (läses av alla autentiserade användare, skrivs endast av admin).

| Metod | Sökväg | Beskrivning |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Hämta alla inställningar |
| `PUT` | `/api/v1/settings` | Massuppdatera inställningar (JSON-kropp med nyckel-värde-par) |
| `GET` | `/api/v1/settings/:key` | Hämta en specifik inställning via nyckel |

Kända nycklar: `disabledTools` (JSON-array av verktygs-ID:n), `enableExperimentalTools` (bool-sträng), `loginAttemptLimit` (nummer).

## Inställningar (per användare) {#preferences}

Per-användarinställningar är separata från instansinställningar. Alla autentiserade användare kan läsa och uppdatera sin egen inställningskarta.

| Metod | Sökväg | Beskrivning |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Hämta den aktuella användarens inställningar som `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Infoga eller uppdatera en eller flera inställningsnycklar för den aktuella användaren |

## Roller {#roles}

Anpassad rollhantering med granulära behörigheter.

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Lista alla roller med antal användare |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Skapa en anpassad roll (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Uppdatera en anpassad roll (kan inte ändra inbyggda roller) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Ta bort en anpassad roll (kan inte ta bort inbyggda roller; berörda användare återgår till `user`-rollen) |

Tillgängliga behörigheter (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Granskningslogg {#audit-log}

Slutpunkt endast för admin för granskning av säkerhetsrelevanta åtgärder.

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Sidindelad granskningslogg med valfria filter |

Frågeparametrar:

| Parameter | Beskrivning |
|-----------|-------------|
| `page` | Sidnummer (standard: 1) |
| `limit` | Poster per sida (standard: 50, max: 100) |
| `action` | Filtrera efter åtgärdstyp (t.ex. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Filtrera efter käll-IP-adress |
| `from` | Filtrera poster efter detta ISO 8601-datum |
| `to` | Filtrera poster före detta ISO 8601-datum |

## Analys {#analytics}

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Publik | Hämta den effektiva analyskonfigurationen (PostHog-nyckel, Sentry DSN, samplingsfrekvens). Nycklar, DSN och instans-ID är tomma när analys är avstängt, antingen från kompileringstidsbakningen eller instansens `analyticsEnabled`-inställning. |
| `POST` | `/api/v1/feedback` | Auth | Skicka explicit användarfeedback till det konfigurerade PostHog-projektet som `feedback_submitted`. Rutten respekterar analysgrindpunkten, begränsar antalet inskick, tar bort kontaktfält om inte `contactOk` är true, och accepterar aldrig filinnehåll, filnamn, uppladdningssökvägar eller rå privat feltext. När analys är inaktiverad returnerar den `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Ställ in den instansomfattande opt-outen. Skicka en JSON-kropp `{ "analyticsEnabled": "false" }` för att stänga av analys för alla, eller `"true"` för att slå på den igen. |

## Funktioner / AI-buntar {#features-ai-bundles}

Hantera AI-funktionsbuntar (installera/avinstallera AI-modellpaket i Docker-miljön). Föredra slutpunkten för installation på verktygsnivå när du aktiverar ett verktyg från anpassad automatisering: vissa AI-verktyg behöver mer än en delad bunt, och denna slutpunkt hoppar över redan installerade buntar och köar endast de saknade.

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | Lista alla funktionsbuntar och deras installationsstatus |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Installera en funktionsbunt (asynkron, returnerar `jobId` för förloppsspårning) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Admin (`features:manage`) | Installera varje bunt som ett verktyg kräver; returnerar köad/överhoppad status per bunt |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Avinstallera en funktionsbunt och rensa upp modellfiler |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Hämta total diskanvändning för AI-modeller |
| `POST` | `/api/v1/admin/features/import` | Admin (`features:manage`) | Importera ett offline-AI-buntarkiv |

## Adminåtgärder {#admin-operations}

Driftsslutpunkter för observerbarhet, support, användningsrapportering och backupstatus.

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Läs den aktuella körtidsloggnivån |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Ändra körtidsloggnivån (`fatal`, `error`, `warn`, `info`, `debug`, `trace` eller `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Prometheus-mätvärden i textformat |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Ladda ner en redigerad diagnostisk support-bunt-ZIP |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Data för användningsdashboarden, med valfri `days`-frågeparameter |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Läs metadata för senaste backup och färskhetsstatus |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Registrera en slutförd backup (`type`, valfri `sizeBytes`, valfri `notes`) |

## Enterprise-API:er {#enterprise-apis}

Dessa rutter är licensgrindade av sin relaterade enterprise-funktion. De kräver fortfarande den angivna SnapOtter-behörigheten.

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Exportera granskningsposter som JSON eller CSV med filter |
| `GET` | `/api/v1/enterprise/config/export` | Admin (`system:health`) | Exportera redigerad instanskonfiguration, anpassade roller och team |
| `POST` | `/api/v1/enterprise/config/import` | Admin (`system:health`) | Importera konfiguration, med valfri torrkörning |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Läs konfigurerad CIDR-tillåtningslista |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Uppdatera CIDR-tillåtningslista med förhindrande av självutlåsning |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Lista rättsliga spärrar för användare och team |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Applicera eller häv en rättslig spärr på en användare eller ett team |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Generera en SCIM-bärartoken, returneras en gång |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Återkalla den aktuella SCIM-bärartoken |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Läs SIEM-vidarebefordringskonfiguration |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Uppdatera SIEM-vidarebefordringskonfiguration |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Lista webhook-destinationer |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Skapa en webhook-destination |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Uppdatera en webhook-destination |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Ta bort en webhook-destination |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Skicka en test-webhook-nyttolast |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Starta ett GDPR-användarexportjobb |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | Läs GDPR-exportstatus och nedladdnings-URL |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Rensa permanent en användares data efter bekräftelse |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Rensa permanent ett teams data efter bekräftelse |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | Läs metadata för app-, build-, Node- och schemaversion |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | Jämför paketerade migreringar med tillämpade migreringar |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Kör kontroller av uppgraderingsberedskap |

### SCIM 2.0 {#scim-2-0}

SCIM-upptäcktsslutpunkter är publika. Användar- och gruppslutpunkter kräver SCIM-bärartoken som genererades ovan.

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Publik | SCIM-serverfunktioner |
| `GET` | `/api/v1/scim/v2/Schemas` | Publik | SCIM-schemaupptäckt |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Publik | SCIM-resurstypsupptäckt |
| `GET` | `/api/v1/scim/v2/Users` | SCIM-token | Lista användare, med valfritt SCIM-filter |
| `POST` | `/api/v1/scim/v2/Users` | SCIM-token | Skapa en användare |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM-token | Hämta en användare |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM-token | Ersätt en användare |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM-token | Mjukt inaktivera en användare |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM-token | Lista team som SCIM-grupper |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM-token | Skapa ett team |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM-token | Hämta ett team |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM-token | Ersätt ett team och gruppmedlemskap |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM-token | Ta bort ett team |

## Memmallar {#meme-templates}

Stödjande API för memgeneratorverktyget.

| Metod | Sökväg | Åtkomst | Beskrivning |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | Lista alla tillgängliga memmallar med textrutepositioner |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Servera mallbild i full storlek |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Servera mallminiatyr |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Servera typsnittsfil som används för rendering av memtext |

## Felsvar {#error-responses}

Alla fel returnerar JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Status | Betydelse |
|--------|---------|
| 400 | Ogiltig förfrågan / validering misslyckades |
| 401 | Inte autentiserad |
| 403 | Otillräckliga behörigheter |
| 404 | Resurs hittades inte |
| 413 | Filen för stor (se `MAX_UPLOAD_SIZE_MB`) |
| 422 | Bearbetning misslyckades efter validering |
| 429 | Hastighetsbegränsad (se `RATE_LIMIT_PER_MIN`) |
| 501 | Nödvändig AI-funktionsbunt är inte installerad (`FEATURE_NOT_INSTALLED`) |
| 500 | Internt serverfel |
