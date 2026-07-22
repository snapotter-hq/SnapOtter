---
description: "Volledige REST API-referentie. Tool-endpoints, batchverwerking, pipelines, bestandsbibliotheek, authenticatie, teams en beheerbewerkingen."
i18n_output_hash: 8f6eabc592c0
i18n_source_hash: 7e0a0db4abe0
i18n_provenance: human
---

# REST API-referentie {#rest-api-reference}

Interactieve API-documentatie met voorbeelden van requests en responses is beschikbaar op [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Machineleesbare specificaties:
- `/api/v1/openapi.yaml` - OpenAPI 3.1-spec
- `/llms.txt` - LLM-vriendelijke samenvatting
- `/llms-full.txt` - Volledige LLM-vriendelijke documentatie

## Authenticatie {#authentication}

Alle endpoints vereisen authenticatie, tenzij `AUTH_ENABLED=false`.

### Sessietoken {#session-token}

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

Sessies verlopen na 7 dagen (configureerbaar via `SESSION_DURATION_HOURS`).

### API-sleutels {#api-keys}

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

Sleutels krijgen het voorvoegsel `si_` en worden opgeslagen als scrypt-hashes. De ruwe sleutel wordt eenmaal getoond en is daarna nooit meer op te vragen.

### Auth-endpoints {#auth-endpoints}

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Publiek | Inloggen, sessietoken ophalen |
| `POST` | `/api/auth/logout` | Auth | Huidige sessie beëindigen |
| `GET` | `/api/auth/session` | Auth | Huidige sessie valideren |
| `POST` | `/api/auth/change-password` | Auth | Eigen wachtwoord wijzigen (maakt alle andere sessies + API-sleutels ongeldig) |
| `GET` | `/api/auth/users` | Admin | Alle gebruikers weergeven |
| `POST` | `/api/auth/register` | Admin | Een nieuwe gebruiker aanmaken |
| `PUT` | `/api/auth/users/:id` | Admin | Rol of team van gebruiker bijwerken |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Wachtwoord van gebruiker opnieuw instellen |
| `DELETE` | `/api/auth/users/:id` | Admin | Een gebruiker verwijderen |
| `GET` | `/api/v1/config/auth` | Publiek | Controleren of authenticatie is ingeschakeld (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Auth | TOTP MFA-registratie starten. Vereist de enterprise-functie `mfa` |
| `POST` | `/api/auth/mfa/verify` | Auth | MFA-registratie bevestigen met een TOTP-code |
| `POST` | `/api/auth/mfa/complete` | Publiek | Een openstaande MFA-inlogverificatie voltooien |
| `POST` | `/api/auth/mfa/disable` | Auth | MFA uitschakelen voor de huidige gebruiker |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | MFA opnieuw instellen voor een gebruiker |
| `GET` | `/api/auth/oidc/login` | Publiek | OIDC-login starten wanneer OIDC is ingeschakeld |
| `GET` | `/api/auth/oidc/callback` | Publiek | OIDC-autorisatiecallback |
| `GET` | `/api/auth/saml/metadata` | Publiek | SAML SP-metadata-XML wanneer SAML is ingeschakeld |
| `GET` | `/api/auth/saml/login` | Publiek | SAML-login starten |
| `POST` | `/api/auth/saml/callback` | Publiek | SAML assertion consumer service |

Wanneer MFA is ingeschakeld voor een gebruiker, retourneert `POST /api/auth/login` een `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` in plaats van een sessietoken. Stuur die `mfaToken` samen met een TOTP- of herstelcode naar `/api/auth/mfa/complete`.

### Permissies {#permissions}

| Permissie | Admin | Gebruiker |
|-----------|:-----:|:----:|
| Tools gebruiken | ✓ | ✓ |
| Eigen bestanden/pipelines/API-sleutels | ✓ | ✓ |
| Bestanden/pipelines/sleutels van alle gebruikers bekijken | ✓ | - |
| Instellingen schrijven | ✓ | - |
| Gebruikers & teams beheren | ✓ | - |
| Branding beheren | ✓ | - |

## Health check {#health-check}

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Publiek | Basale health check. Retourneert `{"status":"healthy","version":"..."}` met 200, of `{"status":"unhealthy"}` met 503 als de database onbereikbaar is. |
| `GET` | `/api/v1/readyz` | Publiek | Readiness-probe. Controleert PostgreSQL, Redis, schijfruimte en S3 indien geconfigureerd. Retourneert 503 wanneer de instance geen verkeer zou moeten ontvangen. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Gedetailleerde diagnostiek, inclusief uptime, opslagmodus, databasestatus, queue-status en GPU-beschikbaarheid. |

## Tools gebruiken {#using-tools}

Elke tool volgt hetzelfde patroon:

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

`<section>` is een van `image`, `video`, `audio`, `pdf` of `files`.

- Uploaden gebeurt met `multipart/form-data`.
- `settings` is een JSON-string met tool-specifieke opties.
- `clientJobId` is een optioneel formulierveld voor door de aanroeper aangeleverde voortgangscorrelatie.
- `fileId` is een optioneel formulierveld dat verwijst naar een bestaand item in de bestandsbibliotheek. Wanneer aanwezig, wordt de verwerkte uitvoer opgeslagen als een nieuwe versie en bevat de response `savedFileId`.
- **Snelle tools** retourneren meestal 200 JSON: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Haal het verwerkte bestand op via `downloadUrl`.
- **Elke tool in de wachtrij** kan 202 JSON retourneren als deze langlopend is of het synchrone wachtvenster overschrijdt: `{"jobId":"...","async":true}`. Verbind met SSE voor voortgang en download bij voltooiing (zie [Voortgang volgen](#progress-tracking)).
- **Batch**-routes retourneren een ZIP-archief dat rechtstreeks wordt gestreamd (met `X-Job-Id`-header) voor tools die zijn geregistreerd in het generieke batchregister.

## Tools-referentie {#tools-reference}

### Conversiepresets {#conversion-presets}

De gedeelde catalogus bevat 83 speciale conversiepreset-endpoints zoals `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` en `excel-to-csv`. Presets zijn eersteklas tool-routes:

`POST /api/v1/tools/<section>/<presetId>`

Elke preset vergrendelt het uitvoerformaat en delegeert naar een basistool zoals `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` of `convert-spreadsheet`. Zie [Conversiepresets](/nl/tools/conversion-presets) voor de volledige routetabel en optionele instellingen.

### Essentials {#essentials}

| Tool-ID | Naam | Belangrijkste instellingen |
|---------|------|-------------|
| `resize` | Formaat wijzigen | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, plus 23 social media-presets |
| `crop` | Bijsnijden | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | Roteren & spiegelen | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Converteren | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Comprimeren | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Optimalisatie {#optimization}

| Tool-ID | Naam | Belangrijkste instellingen |
|---------|------|-------------|
| `optimize-for-web` | Optimaliseren voor web | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Metadata verwijderen | - |
| `edit-metadata` | Metadata bewerken | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Bulk hernoemen | `pattern` (ondersteunt `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Afbeelding naar PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Favicon-generator | `padding`, `backgroundColor`, `borderRadius` - genereert alle standaardformaten |

### Aanpassingen {#adjustments}

| Tool-ID | Naam | Belangrijkste instellingen |
|---------|------|-------------|
| `adjust-colors` | Kleuren aanpassen | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Verscherpen | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Kleur vervangen | `sourceColor`, `targetColor` (vervanging), `makeTransparent`, `tolerance` |
| `color-blindness` | Kleurenblindheidssimulatie | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, standaard \"deuteranomaly\") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixeleren | `blockSize` (2-128), `region` ({left, top, width, height} voor gedeeltelijke pixelering) |
| `vignette` | Vignet | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### AI-tools {#ai-tools}

Alle AI-tools draaien op je eigen hardware: standaard op CPU, of op NVIDIA CUDA wanneer een ondersteunde NVIDIA-GPU beschikbaar is. Intel/AMD-iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt momenteel niet ondersteund voor AI-inferentie. Geen internet vereist.

| Tool-ID | Naam | AI-model | Belangrijkste instellingen |
|---------|------|---------|-------------|
| `remove-background` | Achtergrond verwijderen | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Afbeelding upscalen | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Objectgum | LaMa (ONNX) | Masker verzonden als tweede bestandsdeel (veldnaam `mask`), `format`, `quality` |
| `ocr` | OCR / Tekstextractie | Tesseract (snel); RapidOCR + PP-OCR ONNX (gebalanceerd/beste) | `quality` (snel/gebalanceerd/beste), `language`, `enhance` |
| `blur-faces` | Gezicht / PII vervagen | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Slim bijsnijden | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Afbeelding verbeteren | Op analyse gebaseerd | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Gezicht verbeteren | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | AI-inkleuring | DDColor | `intensity`, `model` |
| `noise-removal` | Ruis verwijderen | Getrapte ruisonderdrukking | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Rode ogen verwijderen | Gezichtslandmark + kleuranalyse | `sensitivity`, `strength` |
| `restore-photo` | Fotorestauratie | Meerstaps-pipeline | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Pasfoto | MediaPipe-landmarks | Tweefasige flow. Analyse gebruikt multipart `file`; genereren gebruikt JSON met `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), landmarks, afbeeldingsafmetingen |
| `content-aware-resize` | Content-Aware Resize | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | PNG-transparantiehersteller | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Achtergrond vervangen | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Achtergrond vervagen | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | AI-canvas uitbreiden | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Watermerk & overlay {#watermark-overlay}

| Tool-ID | Naam | Belangrijkste instellingen |
|---------|------|-------------|
| `watermark-text` | Tekstwatermerk | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Afbeeldingswatermerk | `opacity`, `position`, `scale` - het tweede bestand is het watermerk |
| `text-overlay` | Tekstoverlay | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Afbeeldingscompositie | `x`, `y`, `opacity`, `blend` - het tweede bestand wordt bovenop gelegd |
| `meme-generator` | Meme-generator | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Ondersteunt sjabloonmodus (JSON-body met `templateId`) of aangepaste afbeeldingsmodus (multipart met bestand). |

### Hulpmiddelen {#utilities}

| Tool-ID | Naam | Belangrijkste instellingen |
|---------|------|-------------|
| `info` | Afbeeldingsinfo | - (retourneert width, height, format, size, channels, hasAlpha, DPI, EXIF) |
| `compare` | Afbeeldingen vergelijken | `mode` (side-by-side/overlay/diff), `diffThreshold` - het tweede bestand is het vergelijkingsdoel |
| `find-duplicates` | Duplicaten zoeken | `threshold` (perceptuele hash-afstand, standaard 8) - meerdere bestanden |
| `color-palette` | Kleurenpalet | `count` (aantal dominante kleuren), `format` (hex/rgb) |
| `qr-generate` | QR-codegenerator | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (optioneel bestand) |
| `barcode-read` | Barcodelezer | - (detecteert automatisch QR, EAN, Code128, DataMatrix, enz.) |
| `image-to-base64` | Afbeelding naar Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML naar afbeelding | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histogram | `scale` (linear/log) - retourneert een RGB-histogramgrafiek + statistieken per kanaal |
| `lqip-placeholder` | LQIP-placeholder | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Barcodegenerator | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). JSON-body, geen bestandsupload. |

### Layout & compositie {#layout-composition}

| Tool-ID | Naam | Belangrijkste instellingen |
|---------|------|-------------|
| `collage` | Collage / raster | `template` (25+ layouts), `gap`, `backgroundColor`, `borderRadius` - meerdere bestanden |
| `stitch` | Aan elkaar plakken / combineren | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - meerdere bestanden |
| `split` | Afbeelding opsplitsen | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Rand & kader | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Screenshot verfraaien | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Cirkelvormig bijsnijden | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Afbeelding opvullen | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Sprite sheet | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - meerdere bestanden (2-64 afbeeldingen) |

### Formaat & conversie {#format-conversion}

| Tool-ID | Naam | Belangrijkste instellingen |
|---------|------|-------------|
| `svg-to-raster` | SVG naar raster | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Afbeelding naar SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | GIF-tools | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), actie-specifieke parameters |
| `gif-webp` | GIF/WebP-converter | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Videotools {#video-tools}

| Tool-ID | Naam | Belangrijkste instellingen |
|---------|------|-------------|
| `convert-video` | Video converteren | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Video comprimeren | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Video inkorten | `startS`, `endS`, `precise` (bool, frame-nauwkeurige knip) |
| `mute-video` | Video dempen | - |
| `video-to-gif` | Video naar GIF | `fps` (1-30), `width`, `startS`, `durationS` (max 60s) |
| `resize-video` | Videoformaat wijzigen | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Video bijsnijden | `width`, `height`, `x`, `y` |
| `rotate-video` | Video roteren | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | FPS wijzigen | `fps` (1-120) |
| `video-color` | Videokleur | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Videosnelheid | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Video omkeren | - (max 5 minuten) |
| `video-loudnorm` | Audio normaliseren | - (EBU R128) |
| `aspect-pad` | Aspect-opvulling | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Blur-opvulling | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Video van watermerk voorzien | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Video stabiliseren | `smoothing` (5-60, in frames) |
| `gif-to-video` | GIF naar video | `format` (mp4/webm/mov) |
| `video-to-webp` | Video naar WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Video naar frames | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Video's samenvoegen | - (meerdere bestanden, genormaliseerd naar de resolutie van de eerste video) |
| `replace-audio` | Audio vervangen | - (video- + audiobestand, twee bestanden) |
| `burn-subtitles` | Ondertitels inbranden | `fontSize` (8-72) - video- + ondertitelbestand |
| `embed-subtitles` | Ondertitels insluiten | `language` (ISO 639-2/B-code) - video- + ondertitelbestand |
| `extract-subtitles` | Ondertitels extraheren | - (levert SRT) |
| `images-to-video` | Afbeeldingen naar video | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - meerdere bestanden |
| `video-metadata` | Videometadata opschonen | - |
| `auto-subtitles` | Automatische ondertitels (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Audio extraheren | `format` (mp3/wav/m4a/ogg) |

### Audiotools {#audio-tools}

| Tool-ID | Naam | Belangrijkste instellingen |
|---------|------|-------------|
| `convert-audio` | Audio converteren | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Audio inkorten | `startS`, `endS` |
| `volume-adjust` | Volume aanpassen | `gainDb` (-30 tot 30) |
| `normalize-audio` | Audio normaliseren | - (EBU R128, -16 LUFS) |
| `fade-audio` | Audio faden | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Audio omkeren | - |
| `audio-speed` | Audiosnelheid | `factor` (0.25-4) |
| `pitch-shift` | Toonhoogte verschuiven | `semitones` (-12 tot 12) |
| `audio-channels` | Audiokanalen | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Stilte verwijderen | `thresholdDb` (-80 tot -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Ruisonderdrukking | `strength` (light/medium/strong) |
| `merge-audio` | Audio samenvoegen | `format` (mp3/wav/flac/m4a) - meerdere bestanden |
| `split-audio` | Audio splitsen | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Ringtone-maker | `startS`, `durationS` (1-30) |
| `waveform-image` | Golfvormafbeelding | `width`, `height`, `color` (hex) |
| `audio-metadata` | Audiometadata | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Audio transcriberen (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Documenttools {#document-tools}

| Tool-ID | Naam | Belangrijkste instellingen |
|---------|------|-------------|
| `merge-pdf` | PDF's samenvoegen | - (meerdere bestanden, tot 20 PDF's) |
| `split-pdf` | PDF splitsen | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | PDF comprimeren | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | PDF roteren | `angle` (90/180/270), `range` (paginabereik) |
| `extract-pages` | Pagina's extraheren | `range` (qpdf-syntaxis, bijv. \"1-5,8,10-z\") |
| `remove-pages` | Pagina's verwijderen | `pages` (te verwijderen qpdf-bereik) |
| `organize-pdf` | PDF ordenen | `order` (qpdf-paginavolgorde, bijv. \"3,1,2,5-z\") |
| `protect-pdf` | PDF beveiligen | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | PDF ontgrendelen | `password` |
| `repair-pdf` | PDF repareren | - |
| `linearize-pdf` | PDF web-optimaliseren | - (lineariseren voor snelle weergave op het web) |
| `grayscale-pdf` | PDF grijswaarden | - |
| `pdfa-convert` | PDF/A-conversie | - (archief-PDF/A-2) |
| `crop-pdf` | PDF bijsnijden | `margin` (0-2000 punten) |
| `nup-pdf` | N-up-PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Boekje-PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | PDF van watermerk voorzien | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | PDF-paginanummers | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | PDF plat maken | - (bakt formulieren en annotaties in) |
| `redact-pdf` | PDF redigeren | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | PDF ondertekenen | Aangepaste multipart-route met PDF `file`, handtekeningbestanden `sig0`, `sig1` en `placements` JSON-array |
| `pdf-to-text` | PDF naar tekst | - |
| `pdf-to-word` | PDF naar Word | - |
| `pdf-metadata` | PDF-metadata | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Document converteren | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Presentatie converteren | `format` (pptx/odp) |
| `convert-spreadsheet` | Spreadsheet converteren | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel naar PDF | - |
| `word-to-pdf` | Word naar PDF | - |
| `powerpoint-to-pdf` | PowerPoint naar PDF | - |
| `html-to-pdf` | HTML naar PDF | - (externe resources uitgeschakeld) |
| `markdown-to-docx` | Markdown naar Word | - |
| `markdown-to-html` | Markdown naar HTML | - |
| `markdown-to-pdf` | Markdown naar PDF | - (externe resources uitgeschakeld) |
| `epub-convert` | EPUB converteren | `format` (pdf/docx/html/md) |
| `to-epub` | Converteren naar EPUB | - (accepteert .docx, .md, .html, .txt) |
| `ocr-pdf` | PDF-OCR (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF naar afbeelding | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF naar JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF naar PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF naar TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Bestandstools {#file-tools}

| Tool-ID | Naam | Belangrijkste instellingen |
|---------|------|-------------|
| `chart-maker` | Grafiekmaker | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV naar Excel | `sheet` (werkbladnummer voor XLSX-invoer) - bidirectioneel |
| `csv-json` | CSV naar JSON | `pretty` (bool) - bidirectioneel |
| `json-xml` | JSON naar XML | `pretty` (bool) - bidirectioneel |
| `split-csv` | CSV splitsen | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | CSV's samenvoegen | - (meerdere bestanden, overeenkomende kolommen) |
| `yaml-json` | YAML / JSON | - (bidirectioneel) |
| `xml-to-csv` | XML naar CSV | - (vindt automatisch herhalende elementen) |
| `excel-to-csv` | Excel naar CSV | speciale conversiepreset ondersteund door `convert-spreadsheet` |
| `create-zip` | ZIP maken | - (meerdere bestanden, 2-50 bestanden) |
| `extract-zip` | ZIP uitpakken | - (beschermd tegen zip-bommen) |

### HTML naar afbeelding {#html-to-image}

Leg een webpagina vast als afbeelding. Anders dan andere tools accepteert dit endpoint `application/json` in plaats van multipart-formuliergegevens (geen bestandsupload nodig).

**Endpoint:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `url` | string | (vereist) | Vast te leggen URL (alleen http/https) |
| `format` | string | `"png"` | Uitvoerformaat: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Kwaliteit 1-100 (alleen JPG/WebP) |
| `fullPage` | boolean | `false` | Volledige scrollbare pagina vastleggen |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Aangepaste viewport-breedte 320-3840 |
| `viewportHeight` | number | `720` | Aangepaste viewport-hoogte 320-2160 |

**Voorbeeld:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Response:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Tool-subroutes {#tool-sub-routes}

Sommige tools stellen aanvullende endpoints beschikbaar naast de standaard `POST /api/v1/tools/<section>/<toolId>`:

| Methode | Pad | Beschrijving |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Populaire tool-ID's retourneren, met terugval naar een samengestelde standaardlijst wanneer er weinig gebruiksdata is |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Achtergrondeffecten toepassen (color/gradient/blur/shadow) zonder AI opnieuw uit te voeren. Gebruikt een gecacht masker van de oorspronkelijke verwijdering. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Bestaande EXIF/IPTC/XMP-metadata uit een afbeelding lezen |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Metadatavelden inspecteren vóór het verwijderen |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Fase 1: AI-gezichtsdetectie + achtergrondverwijdering. Retourneert gezichtslandmarks en gecachte data. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Fase 2: bijsnijden, formaat wijzigen en tegelen met behulp van gecachte analyse. Geen nieuwe AI-run. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | GIF-metadata ophalen (aantal frames, afmetingen, duur) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | PDF-metadata ophalen (aantal pagina's, afmetingen) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Een voorbeeld van een specifieke PDF-pagina genereren |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | PDF-metadata ophalen voor de speciale JPG-preset |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Een voorbeeld van een PDF-pagina genereren voor de JPG-preset |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | PDF-metadata ophalen voor de speciale PNG-preset |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Een voorbeeld van een PDF-pagina genereren voor de PNG-preset |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | PDF-metadata ophalen voor de speciale TIFF-preset |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Een voorbeeld van een PDF-pagina genereren voor de TIFF-preset |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Meerdere SVG's in batch naar raster converteren |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Afbeeldingskwaliteit analyseren en verbeteringsaanbevelingen retourneren |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Lichtgewicht voorbeeld voor live parameterafstemming. Retourneert een geoptimaliseerde afbeelding met formaatheaders. |

## Batchverwerking {#batch-processing}

Pas een generieke batch-geschikte tool tegelijk toe op meerdere bestanden. Retourneert een ZIP-archief. Aangepaste routes voor meerdere bestanden of meerdere stappen, zoals PDF-ondertekening en PDF-naar-afbeelding-preset-routes, gebruiken hun eigen endpointcontract in plaats van de generieke `/batch`-route.

De tool `ocr-pdf` ondersteunt deze generieke `/batch`-route.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Concurrency wordt bepaald door `CONCURRENT_JOBS` (standaard: automatisch gedetecteerd op basis van CPU-cores). `MAX_BATCH_SIZE` beperkt het aantal bestanden per batch (standaard: 100; stel 0 in voor onbeperkt).

## Pipelines {#pipelines}

### Een pipeline uitvoeren {#execute-a-pipeline}

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

De uitvoer van elke stap is de invoer van de volgende stap. Pipelines staan standaard 20 stappen toe, configureerbaar via `MAX_PIPELINE_STEPS`. Stel `MAX_PIPELINE_STEPS=0` in om de limiet te verwijderen.

### Pipelines opslaan en beheren {#save-and-manage-pipelines}

| Methode | Pad | Beschrijving |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Een benoemde pipeline opslaan (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Opgeslagen pipelines weergeven (admins zien alles; gebruikers zien de eigen) |
| `DELETE` | `/api/v1/pipeline/:id` | Verwijderen (eigenaar of admin) |
| `GET` | `/api/v1/pipeline/tools` | Tool-ID's weergeven die geldig zijn voor pipelinestappen |

## Voortgang volgen {#progress-tracking}

Langlopende taken, tools in de wachtrij, batchtaken en pipelines geven realtime voortgang door via Server-Sent Events. De voortgangsstroom is publiek en gekoppeld aan de job-ID, dus clients hoeven geen Authorization-header te sturen om deze te lezen.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Event-formaat:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Je kunt annulering aanvragen voor een taak in de wachtrij of een lopende taak met `POST /api/v1/jobs/:jobId/cancel`. De response is `{"canceled":true|false}`.

## Bestandsbibliotheek {#file-library}

Persistente bestandsopslag met versiegeschiedenis.

| Methode | Pad | Beschrijving |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Bestanden uploaden naar de werkruimte (tijdelijke verwerking) |
| `POST` | `/api/v1/files/upload` | Bestanden uploaden naar de persistente bestandsbibliotheek |
| `POST` | `/api/v1/files/save-result` | Een tool-verwerkingsresultaat opslaan als een nieuwe bestandsversie |
| `GET` | `/api/v1/files` | Opgeslagen bestanden weergeven (gepagineerd, met zoekfunctie) |
| `GET` | `/api/v1/files/:id` | Bestandsmetadata + versieketen ophalen |
| `GET` | `/api/v1/files/:id/download` | Bestand downloaden |
| `GET` | `/api/v1/files/:id/thumbnail` | 300px JPEG-thumbnail ophalen |
| `DELETE` | `/api/v1/files` | Bestanden en hun versieketens in bulk verwijderen (body: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Externe URL's ophalen in de werkruimte voor URL-gebaseerde imports |
| `POST` | `/api/v1/preview` | Een browsercompatibele WebP-preview genereren (voor HEIC/HEIF/RAW-formaten) |
| `GET` | `/api/v1/files/:id/preview` | Een gecachte of gegenereerde browsercompatibele preview streamen voor een opgeslagen PDF, Office-document, video of audiobestand |
| `POST` | `/api/v1/preview/generate` | Een on-demand MP4- of MP3-preview genereren voor een geüpload mediabestand zonder het eerst op te slaan |
| `GET` | `/api/v1/download/:jobId/:filename` | Een verwerkt bestand downloaden uit een werkruimte |

Om een tool-resultaat automatisch op te slaan in de bibliotheek, voeg je `fileId` toe als multipart-formulierveld dat verwijst naar een bestaand bibliotheekbestand. Het verwerkte resultaat wordt opgeslagen als een nieuwe versie.

## API-sleutelbeheer {#api-key-management}

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Nieuwe sleutel genereren - eenmaal getoond |
| `GET` | `/api/v1/api-keys` | Auth | Sleutels weergeven (name, id, lastUsedAt - niet de ruwe sleutel) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Sleutel verwijderen |

## Teams {#teams}

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Teams weergeven |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Team aanmaken |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Team hernoemen |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Team verwijderen (het standaardteam of teams met leden kunnen niet worden verwijderd) |

## Instellingen {#settings}

De runtimeconfiguratie gebruikt een gesloten verzameling herkende sleutels. Lezen vereist `settings:read` en schrijven vereist `settings:write`; beveiligings- en compliancesleutels vereisen daarnaast respectievelijk `security:manage` of `compliance:manage`. Geheime instellingen vereisen volledige beheerdersbevoegdheid, terwijl referenties en status die door specifieke endpoints worden beheerd hier alleen-lezen zijn. Bulkwijzigingen worden gevalideerd voordat een waarde wordt geschreven.

| Methode | Pad | Beschrijving |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Alle instellingen ophalen |
| `PUT` | `/api/v1/settings` | Instellingen in bulk bijwerken (JSON-body met key-value-paren) |
| `GET` | `/api/v1/settings/:key` | Een specifieke instelling ophalen op sleutel |

Representatieve sleutels: `disabledTools` (JSON-array van tool-ID's), `enableExperimentalTools` (booleaanse waarde), `loginAttemptLimit` (beveiligingsbeleid) en `auditRetentionDays` (compliancebeleid). Onbekende sleutels worden geweigerd.

## Voorkeuren {#preferences}

Gebruikersvoorkeuren staan los van instance-instellingen. Elke geauthenticeerde gebruiker kan de eigen voorkeurenmap lezen en bijwerken.

| Methode | Pad | Beschrijving |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | De voorkeuren van de huidige gebruiker ophalen als `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Een of meer voorkeurssleutels voor de huidige gebruiker upserten |

## Rollen {#roles}

Beheer van aangepaste rollen met gedetailleerde permissies.

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Alle rollen weergeven met aantallen gebruikers |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Een aangepaste rol aanmaken (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Een aangepaste rol bijwerken (ingebouwde rollen kunnen niet worden gewijzigd) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Een aangepaste rol verwijderen (ingebouwde rollen kunnen niet worden verwijderd; getroffen gebruikers keren terug naar de rol `user`) |

Beschikbare permissies (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Auditlog {#audit-log}

Alleen voor admins bestemd endpoint voor het beoordelen van beveiligingsrelevante acties.

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Gepagineerd auditlog met optionele filters |

Query-parameters:

| Parameter | Beschrijving |
|-----------|-------------|
| `page` | Paginanummer (standaard: 1) |
| `limit` | Vermeldingen per pagina (standaard: 50, max: 100) |
| `action` | Filteren op actietype (bijv. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Filteren op bron-IP-adres |
| `from` | Vermeldingen filteren na deze ISO 8601-datum |
| `to` | Vermeldingen filteren vóór deze ISO 8601-datum |

## Analytics {#analytics}

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Publiek | De effectieve analytics-configuratie ophalen (PostHog-sleutel, Sentry-DSN, sample rate). Sleutels, DSN en instance-ID zijn leeg wanneer analytics uit staat, hetzij door de compile-time-bake, hetzij door de instance-instelling `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Auth | Expliciete gebruikersfeedback indienen bij het geconfigureerde PostHog-project als `feedback_submitted`. De route respecteert de analytics-gate, beperkt de frequentie van inzendingen, verwijdert contactvelden tenzij `contactOk` waar is, en accepteert nooit bestandsinhoud, bestandsnamen, uploadpaden of ruwe private foutmeldingstekst. Wanneer analytics is uitgeschakeld, retourneert de route `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | De instance-brede opt-out instellen. Stuur een JSON-body `{ "analyticsEnabled": "false" }` om analytics voor iedereen uit te schakelen, of `"true"` om deze weer in te schakelen. |

## Features / AI-bundels {#features-ai-bundles}

Beheer AI-feature-bundels (installeer/verwijder AI-modelpakketten in de Docker-omgeving). Geef bij het inschakelen van een tool vanuit aangepaste automatisering de voorkeur aan het tool-niveau-installatie-endpoint: sommige AI-tools hebben meer dan één gedeelde bundel nodig, en dit endpoint slaat reeds geïnstalleerde bundels over en zet alleen de ontbrekende in de wachtrij.

OCR is een optionele verbetering in plaats van een harde afhankelijkheid. De `fast` Tesseract-laag werkt zonder pakket; `POST /api/v1/admin/features/ocr/install` installeert het ondertekende RapidOCR-pakket voor `balanced` en `best` op Linux amd64 of arm64. De nauwkeurige OCR-runtime gebruikt CPU op alleen CPU en NVIDIA-hosts en vereist minimaal 4 GiB effectief geheugen (de geconfigureerde container cgroup-limiet, anders hostgeheugen). SnapOtter rapporteert `requiredMemoryBytes`, `effectiveMemoryBytes` en een `insufficient-memory`-compatibiliteitsreden, en wijst een incompatibele installatie af vóór het downloaden. Deze geheugenvereiste is niet van toepassing op `fast`. Het pakket bevat ongeveer 208-234 MiB om te downloaden en 409-488 MiB geïnstalleerd, afhankelijk van het doel; de ondertekende index bindt de exacte afmetingen die tijdens de installatie worden afgedwongen.

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | Alle feature-bundels en hun installatiestatus weergeven |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Een feature-bundel installeren (async, retourneert `jobId` voor voortgangsvolging) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Admin (`features:manage`) | Elke bundel installeren die een tool vereist; retourneert de queued/skipped-status per bundel |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Een feature-bundel verwijderen en modelbestanden opruimen |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Het totale schijfgebruik van AI-modellen ophalen |
| `POST` | `/api/v1/admin/features/import` | Beheerder (`features:manage`) | Importeer een oudere AI-bundel (`file`) of een ondertekende offline OCR-release (`index` plus `archive`) |

Een air-gapped OCR-import moet de ondertekende `ocr-runtime-index.json` van de release en het bijbehorende platformarchief bevatten. SnapOtter past dezelfde Ed25519-handtekening, artefacthash, compatibiliteit, extractie en rooktestcontroles toe die worden gebruikt bij online installatie:

```bash
curl -X POST http://localhost:1349/api/v1/admin/features/import \
  -H "Authorization: Bearer <admin-token>" \
  -F "index=@ocr-runtime-index.json" \
  -F "archive=@ocr-linux-amd64-cpu-py312.tar.gz"
```

Gebruik het `linux-arm64-cpu-py311`-archief op arm64. Een ondertekend artefact voor een ander doel wordt afgewezen in plaats van geïnstalleerd.

## Beheerbewerkingen {#admin-operations}

Operationele endpoints voor observability, support, gebruiksrapportage en backupstatus.

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Het huidige runtime-logniveau lezen |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Het runtime-logniveau wijzigen (`fatal`, `error`, `warn`, `info`, `debug`, `trace` of `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Prometheus-metrics in tekstformaat |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Een geredigeerde diagnostische supportbundel-ZIP downloaden |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Gegevens voor het gebruiksdashboard, met optionele `days`-queryparameter |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Metadata en actualiteitsstatus van de laatste backup lezen |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Een voltooide backup registreren (`type`, optioneel `sizeBytes`, optioneel `notes`) |

## Enterprise-API's {#enterprise-apis}

Deze routes zijn licentiegebonden door de bijbehorende enterprise-functie. Ze vereisen nog steeds de vermelde SnapOtter-permissie.

**Volledige ingebouwde beheerder** betekent dat de geauthenticeerde actor de rol `admin` en de volledige effectieve set beheerderspermissies heeft. Een API-sleutelbereik dat ook maar één beheerderspermissie weglaat, komt niet in aanmerking.

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Auditvermeldingen exporteren als JSON of CSV met filters |
| `GET` | `/api/v1/enterprise/config/export` | Volledige ingebouwde beheerder | Geredigeerde instance-configuratie, aangepaste rollen en teams exporteren |
| `POST` | `/api/v1/enterprise/config/import` | Volledige ingebouwde beheerder | Configuratie importeren, met optionele dry run |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Geconfigureerde CIDR-allowlist lezen |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | CIDR-allowlist bijwerken met bescherming tegen zelf-buitensluiting |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Legal holds voor gebruikers en teams weergeven |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Een legal hold op een gebruiker of team toepassen of opheffen |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Een SCIM-bearertoken genereren, eenmaal geretourneerd |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Het huidige SCIM-bearertoken intrekken |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | SIEM-forwardingconfiguratie lezen |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | SIEM-forwardingconfiguratie bijwerken |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Webhook-bestemmingen weergeven |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Een webhook-bestemming aanmaken |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Een webhook-bestemming bijwerken |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Een webhook-bestemming verwijderen |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Een test-webhook-payload versturen |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Een GDPR-gebruikersexporttaak starten |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | GDPR-exportstatus en download-URL lezen |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | De gegevens van een gebruiker na bevestiging permanent verwijderen |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | De gegevens van een team na bevestiging permanent verwijderen |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | App-, build-, Node- en schemaversiemetadata lezen |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | Meegeleverde migraties vergelijken met toegepaste migraties |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Upgrade-gereedheidscontroles uitvoeren |

### SCIM 2.0 {#scim-2-0}

SCIM-discovery-endpoints zijn publiek. User- en group-endpoints vereisen het hierboven gegenereerde SCIM-bearertoken.

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Publiek | SCIM-servercapaciteiten |
| `GET` | `/api/v1/scim/v2/Schemas` | Publiek | SCIM-schema-discovery |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Publiek | SCIM-resourcetype-discovery |
| `GET` | `/api/v1/scim/v2/Users` | SCIM-token | Gebruikers weergeven, met optioneel SCIM-filter |
| `POST` | `/api/v1/scim/v2/Users` | SCIM-token | Een gebruiker aanmaken |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM-token | Een gebruiker ophalen |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM-token | Een gebruiker vervangen |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM-token | Een gebruiker soft-deactiveren |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM-token | Teams weergeven als SCIM-groepen |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM-token | Een team aanmaken |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM-token | Een team ophalen |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM-token | Een team en groepslidmaatschap vervangen |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM-token | Een team verwijderen |

## Meme-sjablonen {#meme-templates}

Ondersteunende API voor de meme-generatortool.

| Methode | Pad | Toegang | Beschrijving |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | Alle beschikbare meme-sjablonen weergeven met tekstvakposities |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Sjabloonafbeelding op volledige grootte serveren |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Sjabloonthumbnail serveren |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Fontbestand serveren dat wordt gebruikt voor het renderen van meme-tekst |

## Foutresponses {#error-responses}

Alle fouten retourneren JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Status | Betekenis |
|--------|---------|
| 400 | Ongeldig verzoek / validatie mislukt |
| 401 | Niet geauthenticeerd |
| 403 | Onvoldoende permissies |
| 404 | Resource niet gevonden |
| 413 | Bestand te groot (zie `MAX_UPLOAD_SIZE_MB`) |
| 422 | Verwerking mislukt na validatie |
| 429 | Rate-limited (zie `RATE_LIMIT_PER_MIN`) |
| 501 | Vereiste AI-feature-bundel is niet geïnstalleerd (`FEATURE_NOT_INSTALLED`) |
| 500 | Interne serverfout |
