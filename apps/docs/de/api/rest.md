---
description: "Vollständige REST-API-Referenz. Tool-Endpunkte, Stapelverarbeitung, Pipelines, Dateibibliothek, Authentifizierung, Teams und Admin-Operationen."
i18n_source_hash: 8646977f7cc9
i18n_provenance: machine
i18n_output_hash: 8efd33eca67a
---

# REST-API-Referenz {#rest-api-reference}

Interaktive API-Dokumentation mit Beispielen für Anfragen und Antworten ist verfügbar unter [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Maschinenlesbare Spezifikationen:
- `/api/v1/openapi.yaml` - OpenAPI-3.1-Spezifikation
- `/llms.txt` - LLM-freundliche Zusammenfassung
- `/llms-full.txt` - Vollständige LLM-freundliche Dokumentation

## Authentifizierung {#authentication}

Alle Endpunkte erfordern eine Authentifizierung, sofern nicht `AUTH_ENABLED=false`.

### Sitzungs-Token {#session-token}

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

Sitzungen laufen nach 7 Tagen ab (konfigurierbar über `SESSION_DURATION_HOURS`).

### API-Schlüssel {#api-keys}

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

Schlüssel erhalten das Präfix `si_` und werden als scrypt-Hashes gespeichert. Der Rohschlüssel wird einmal angezeigt und ist danach nie wieder abrufbar.

### Auth-Endpunkte {#auth-endpoints}

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Öffentlich | Anmelden, Sitzungs-Token erhalten |
| `POST` | `/api/auth/logout` | Auth | Aktuelle Sitzung beenden |
| `GET` | `/api/auth/session` | Auth | Aktuelle Sitzung validieren |
| `POST` | `/api/auth/change-password` | Auth | Eigenes Passwort ändern (macht alle anderen Sitzungen + API-Schlüssel ungültig) |
| `GET` | `/api/auth/users` | Admin | Alle Benutzer auflisten |
| `POST` | `/api/auth/register` | Admin | Neuen Benutzer erstellen |
| `PUT` | `/api/auth/users/:id` | Admin | Benutzerrolle oder -team aktualisieren |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Passwort eines Benutzers zurücksetzen |
| `DELETE` | `/api/auth/users/:id` | Admin | Einen Benutzer löschen |
| `GET` | `/api/v1/config/auth` | Öffentlich | Prüfen, ob die Authentifizierung aktiviert ist (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Auth | TOTP-MFA-Registrierung starten. Erfordert das Enterprise-Feature `mfa` |
| `POST` | `/api/auth/mfa/verify` | Auth | MFA-Registrierung mit einem TOTP-Code bestätigen |
| `POST` | `/api/auth/mfa/complete` | Öffentlich | Eine ausstehende MFA-Login-Challenge abschließen |
| `POST` | `/api/auth/mfa/disable` | Auth | MFA für den aktuellen Benutzer deaktivieren |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | MFA für einen Benutzer zurücksetzen |
| `GET` | `/api/auth/oidc/login` | Öffentlich | OIDC-Login starten, wenn OIDC aktiviert ist |
| `GET` | `/api/auth/oidc/callback` | Öffentlich | OIDC-Autorisierungs-Callback |
| `GET` | `/api/auth/saml/metadata` | Öffentlich | SAML-SP-Metadaten-XML, wenn SAML aktiviert ist |
| `GET` | `/api/auth/saml/login` | Öffentlich | SAML-Login starten |
| `POST` | `/api/auth/saml/callback` | Öffentlich | SAML Assertion Consumer Service |

Wenn MFA für einen Benutzer aktiviert ist, gibt `POST /api/auth/login` statt eines Sitzungs-Tokens `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` zurück. Senden Sie dieses `mfaToken` zusammen mit einem TOTP- oder Wiederherstellungscode an `/api/auth/mfa/complete`.

### Berechtigungen {#permissions}

| Berechtigung | Admin | Benutzer |
|-----------|:-----:|:----:|
| Tools verwenden | ✓ | ✓ |
| Eigene Dateien/Pipelines/API-Schlüssel | ✓ | ✓ |
| Dateien/Pipelines/Schlüssel aller Benutzer sehen | ✓ | - |
| Einstellungen schreiben | ✓ | - |
| Benutzer & Teams verwalten | ✓ | - |
| Branding verwalten | ✓ | - |

## Health-Check {#health-check}

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Öffentlich | Grundlegender Health-Check. Gibt `{"status":"healthy","version":"..."}` mit 200 zurück oder `{"status":"unhealthy"}` mit 503, wenn die Datenbank nicht erreichbar ist. |
| `GET` | `/api/v1/readyz` | Öffentlich | Readiness-Probe. Prüft PostgreSQL, Redis, Speicherplatz und S3, sofern konfiguriert. Gibt 503 zurück, wenn die Instanz keinen Datenverkehr erhalten sollte. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Detaillierte Diagnose einschließlich Betriebszeit, Speichermodus, Datenbankstatus, Warteschlangenstatus und GPU-Verfügbarkeit. |

## Tools verwenden {#using-tools}

Jedes Tool folgt demselben Muster:

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

`<section>` ist einer der Werte `image`, `video`, `audio`, `pdf` oder `files`.

- Der Upload ist `multipart/form-data`.
- `settings` ist ein JSON-String mit tool-spezifischen Optionen.
- `clientJobId` ist ein optionales Formularfeld für vom Aufrufer bereitgestellte Fortschrittskorrelation.
- `fileId` ist ein optionales Formularfeld, das auf ein vorhandenes Element der Dateibibliothek verweist. Wenn vorhanden, wird die verarbeitete Ausgabe als neue Version gespeichert und die Antwort enthält `savedFileId`.
- **Schnelle Tools** geben in der Regel 200-JSON zurück: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Rufen Sie die verarbeitete Datei von `downloadUrl` ab.
- **Jedes eingereihte Tool** kann 202-JSON zurückgeben, wenn es lange läuft oder das synchrone Warte-Zeitfenster überschreitet: `{"jobId":"...","async":true}`. Verbinden Sie sich mit SSE für den Fortschritt und laden Sie die Datei nach Abschluss herunter (siehe [Fortschrittsverfolgung](#progress-tracking)).
- **Batch**-Routen geben ein direkt gestreamtes ZIP-Archiv zurück (mit `X-Job-Id`-Header) für Tools, die im generischen Batch-Register registriert sind.

## Tools-Referenz {#tools-reference}

### Konvertierungs-Presets {#conversion-presets}

Der gemeinsame Katalog enthält 83 dedizierte Konvertierungs-Preset-Endpunkte wie `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` und `excel-to-csv`. Presets sind vollwertige Tool-Routen:

`POST /api/v1/tools/<section>/<presetId>`

Jedes Preset legt das Ausgabeformat fest und delegiert an ein Basis-Tool wie `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` oder `convert-spreadsheet`. Die vollständige Routentabelle und die optionalen Einstellungen finden Sie unter [Konvertierungs-Presets](/de/tools/conversion-presets).

### Grundlagen {#essentials}

| Tool-ID | Name | Wichtige Einstellungen |
|---------|------|-------------|
| `resize` | Größe ändern | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, plus 23 Social-Media-Presets |
| `crop` | Zuschneiden | `left`, `top`, `width`, `height`, `unit` (px/Prozent) |
| `rotate` | Drehen & Spiegeln | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Konvertieren | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Komprimieren | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Optimierung {#optimization}

| Tool-ID | Name | Wichtige Einstellungen |
|---------|------|-------------|
| `optimize-for-web` | Für Web optimieren | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Metadaten entfernen | - |
| `edit-metadata` | Metadaten bearbeiten | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Massen-Umbenennung | `pattern` (unterstützt `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Bild zu PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Favicon-Generator | `padding`, `backgroundColor`, `borderRadius` - generiert alle Standardgrößen |

### Anpassungen {#adjustments}

| Tool-ID | Name | Wichtige Einstellungen |
|---------|------|-------------|
| `adjust-colors` | Farben anpassen | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Schärfen | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Farbe ersetzen | `sourceColor`, `targetColor` (Ersatz), `makeTransparent`, `tolerance` |
| `color-blindness` | Farbenblindheits-Simulation | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, Standard \"deuteranomaly\") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Verpixeln | `blockSize` (2-128), `region` ({left, top, width, height} für teilweise Verpixelung) |
| `vignette` | Vignette | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### KI-Tools {#ai-tools}

Alle KI-Tools laufen auf Ihrer Hardware: standardmäßig auf der CPU oder auf NVIDIA CUDA, wenn eine unterstützte NVIDIA-GPU verfügbar ist. Intel/AMD-iGPU-Beschleunigung über VA-API, Quick Sync oder OpenCL wird für KI-Inferenz derzeit nicht unterstützt. Keine Internetverbindung erforderlich.

| Tool-ID | Name | KI-Modell | Wichtige Einstellungen |
|---------|------|---------|-------------|
| `remove-background` | Hintergrund entfernen | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Bild-Hochskalierung | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Objekt-Radierer | LaMa (ONNX) | Maske als zweiter Datei-Teil gesendet (Feldname `mask`), `format`, `quality` |
| `ocr` | OCR / Textextraktion | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Gesichts-/PII-Unschärfe | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Smart Crop | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Bildverbesserung | Analysebasiert | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Gesichtsverbesserung | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | KI-Kolorierung | DDColor | `intensity`, `model` |
| `noise-removal` | Rauschentfernung | Gestufte Entrauschung | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Rote-Augen-Entfernung | Gesichts-Landmarken + Farbanalyse | `sensitivity`, `strength` |
| `restore-photo` | Fotorestaurierung | Mehrstufige Pipeline | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Passfoto | MediaPipe-Landmarken | Zweiphasiger Ablauf. Die Analyse verwendet multipart `file`; die Generierung verwendet JSON mit `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), Landmarken, Bildabmessungen |
| `content-aware-resize` | Inhaltsbasierte Größenänderung | Seam Carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | PNG-Transparenz-Korrektur | BiRefNet HR-Matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Hintergrund ersetzen | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Hintergrund weichzeichnen | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | KI-Leinwand-Erweiterung | LaMa (Outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Wasserzeichen & Overlay {#watermark-overlay}

| Tool-ID | Name | Wichtige Einstellungen |
|---------|------|-------------|
| `watermark-text` | Text-Wasserzeichen | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Bild-Wasserzeichen | `opacity`, `position`, `scale` - die zweite Datei ist das Wasserzeichen |
| `text-overlay` | Text-Overlay | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Bildkomposition | `x`, `y`, `opacity`, `blend` - die zweite Datei wird darübergelegt |
| `meme-generator` | Meme-Generator | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Unterstützt den Vorlagenmodus (JSON-Body mit `templateId`) oder den benutzerdefinierten Bildmodus (multipart mit Datei). |

### Dienstprogramme {#utilities}

| Tool-ID | Name | Wichtige Einstellungen |
|---------|------|-------------|
| `info` | Bildinformationen | - (gibt Breite, Höhe, Format, Größe, Kanäle, hasAlpha, DPI, EXIF zurück) |
| `compare` | Bildvergleich | `mode` (side-by-side/overlay/diff), `diffThreshold` - die zweite Datei ist das Vergleichsziel |
| `find-duplicates` | Duplikate finden | `threshold` (Abstand des perzeptuellen Hashs, Standard 8) - Mehrfachdatei |
| `color-palette` | Farbpalette | `count` (Anzahl der dominanten Farben), `format` (hex/rgb) |
| `qr-generate` | QR-Code-Generator | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (optionale Datei) |
| `barcode-read` | Barcode-Leser | - (erkennt automatisch QR, EAN, Code128, DataMatrix usw.) |
| `image-to-base64` | Bild zu Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML zu Bild | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histogramm | `scale` (linear/log) - gibt RGB-Histogramm-Diagramm + Statistiken pro Kanal zurück |
| `lqip-placeholder` | LQIP-Platzhalter | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Barcode-Generator | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). JSON-Body, kein Datei-Upload. |

### Layout & Komposition {#layout-composition}

| Tool-ID | Name | Wichtige Einstellungen |
|---------|------|-------------|
| `collage` | Collage / Raster | `template` (25+ Layouts), `gap`, `backgroundColor`, `borderRadius` - Mehrfachdatei |
| `stitch` | Zusammenfügen / Kombinieren | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - Mehrfachdatei |
| `split` | Bildaufteilung | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Rand & Rahmen | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Screenshot verschönern | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Kreis-Zuschnitt | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Bild auffüllen | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Sprite-Sheet | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - Mehrfachdatei (2-64 Bilder) |

### Format & Konvertierung {#format-conversion}

| Tool-ID | Name | Wichtige Einstellungen |
|---------|------|-------------|
| `svg-to-raster` | SVG zu Raster | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Bild zu SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | GIF-Tools | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), aktionsspezifische Parameter |
| `gif-webp` | GIF/WebP-Konverter | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Video-Tools {#video-tools}

| Tool-ID | Name | Wichtige Einstellungen |
|---------|------|-------------|
| `convert-video` | Video konvertieren | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Video komprimieren | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Video zuschneiden | `startS`, `endS`, `precise` (bool, bildgenauer Schnitt) |
| `mute-video` | Video stummschalten | - |
| `video-to-gif` | Video zu GIF | `fps` (1-30), `width`, `startS`, `durationS` (max. 60s) |
| `resize-video` | Video-Größe ändern | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Video zuschneiden (Crop) | `width`, `height`, `x`, `y` |
| `rotate-video` | Video drehen | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | FPS ändern | `fps` (1-120) |
| `video-color` | Video-Farbe | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Video-Geschwindigkeit | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Video umkehren | - (max. 5 Minuten) |
| `video-loudnorm` | Audio normalisieren | - (EBU R128) |
| `aspect-pad` | Seitenverhältnis auffüllen | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Unschärfe-Auffüllung | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Video mit Wasserzeichen | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Video stabilisieren | `smoothing` (5-60, in Frames) |
| `gif-to-video` | GIF zu Video | `format` (mp4/webm/mov) |
| `video-to-webp` | Video zu WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Video zu Frames | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Videos zusammenführen | - (Mehrfachdatei, auf die Auflösung des ersten Videos normalisiert) |
| `replace-audio` | Audio ersetzen | - (Video- + Audiodatei, zwei Dateien) |
| `burn-subtitles` | Untertitel einbrennen | `fontSize` (8-72) - Video- + Untertiteldatei |
| `embed-subtitles` | Untertitel einbetten | `language` (ISO-639-2/B-Code) - Video- + Untertiteldatei |
| `extract-subtitles` | Untertitel extrahieren | - (gibt SRT aus) |
| `images-to-video` | Bilder zu Video | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - Mehrfachdatei |
| `video-metadata` | Video-Metadaten bereinigen | - |
| `auto-subtitles` | Auto-Untertitel (KI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Audio extrahieren | `format` (mp3/wav/m4a/ogg) |

### Audio-Tools {#audio-tools}

| Tool-ID | Name | Wichtige Einstellungen |
|---------|------|-------------|
| `convert-audio` | Audio konvertieren | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Audio zuschneiden | `startS`, `endS` |
| `volume-adjust` | Lautstärke anpassen | `gainDb` (-30 bis 30) |
| `normalize-audio` | Audio normalisieren | - (EBU R128, -16 LUFS) |
| `fade-audio` | Audio ein-/ausblenden | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Audio umkehren | - |
| `audio-speed` | Audio-Geschwindigkeit | `factor` (0.25-4) |
| `pitch-shift` | Tonhöhe verschieben | `semitones` (-12 bis 12) |
| `audio-channels` | Audio-Kanäle | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Stille entfernen | `thresholdDb` (-80 bis -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Rauschunterdrückung | `strength` (light/medium/strong) |
| `merge-audio` | Audio zusammenführen | `format` (mp3/wav/flac/m4a) - Mehrfachdatei |
| `split-audio` | Audio aufteilen | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Klingelton-Ersteller | `startS`, `durationS` (1-30) |
| `waveform-image` | Wellenform-Bild | `width`, `height`, `color` (hex) |
| `audio-metadata` | Audio-Metadaten | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Audio transkribieren (KI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Dokument-Tools {#document-tools}

| Tool-ID | Name | Wichtige Einstellungen |
|---------|------|-------------|
| `merge-pdf` | PDFs zusammenführen | - (Mehrfachdatei, bis zu 20 PDFs) |
| `split-pdf` | PDF aufteilen | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | PDF komprimieren | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | PDF drehen | `angle` (90/180/270), `range` (Seitenbereich) |
| `extract-pages` | Seiten extrahieren | `range` (qpdf-Syntax, z.B. \"1-5,8,10-z\") |
| `remove-pages` | Seiten entfernen | `pages` (zu entfernender qpdf-Bereich) |
| `organize-pdf` | PDF organisieren | `order` (qpdf-Seitenreihenfolge, z.B. \"3,1,2,5-z\") |
| `protect-pdf` | PDF schützen | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | PDF entsperren | `password` |
| `repair-pdf` | PDF reparieren | - |
| `linearize-pdf` | PDF für Web optimieren | - (linearisieren für schnelle Web-Anzeige) |
| `grayscale-pdf` | PDF in Graustufen | - |
| `pdfa-convert` | PDF/A konvertieren | - (Archiv-PDF/A-2) |
| `crop-pdf` | PDF zuschneiden | `margin` (0-2000 Punkte) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Broschüren-PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | PDF mit Wasserzeichen | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | PDF-Seitenzahlen | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | PDF reduzieren (Flatten) | - (fixiert Formulare und Anmerkungen) |
| `redact-pdf` | PDF schwärzen (Redact) | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | PDF signieren | Benutzerdefinierte multipart-Route mit PDF `file`, Signaturdateien `sig0`, `sig1` und `placements` JSON-Array |
| `pdf-to-text` | PDF zu Text | - |
| `pdf-to-word` | PDF zu Word | - |
| `pdf-metadata` | PDF-Metadaten | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Dokument konvertieren | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Präsentation konvertieren | `format` (pptx/odp) |
| `convert-spreadsheet` | Tabellenkalkulation konvertieren | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel zu PDF | - |
| `word-to-pdf` | Word zu PDF | - |
| `powerpoint-to-pdf` | PowerPoint zu PDF | - |
| `html-to-pdf` | HTML zu PDF | - (Remote-Ressourcen deaktiviert) |
| `markdown-to-docx` | Markdown zu Word | - |
| `markdown-to-html` | Markdown zu HTML | - |
| `markdown-to-pdf` | Markdown zu PDF | - (Remote-Ressourcen deaktiviert) |
| `epub-convert` | EPUB konvertieren | `format` (pdf/docx/html/md) |
| `to-epub` | Zu EPUB konvertieren | - (akzeptiert .docx, .md, .html, .txt) |
| `ocr-pdf` | PDF-OCR (KI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF zu Bild | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF zu JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF zu PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF zu TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Datei-Tools {#file-tools}

| Tool-ID | Name | Wichtige Einstellungen |
|---------|------|-------------|
| `chart-maker` | Diagramm-Ersteller | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV zu Excel | `sheet` (Arbeitsblattnummer für XLSX-Eingabe) - bidirektional |
| `csv-json` | CSV zu JSON | `pretty` (bool) - bidirektional |
| `json-xml` | JSON zu XML | `pretty` (bool) - bidirektional |
| `split-csv` | CSV aufteilen | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | CSVs zusammenführen | - (Mehrfachdatei, übereinstimmende Spalten) |
| `yaml-json` | YAML / JSON | - (bidirektional) |
| `xml-to-csv` | XML zu CSV | - (findet automatisch sich wiederholende Elemente) |
| `excel-to-csv` | Excel zu CSV | dediziertes Konvertierungs-Preset, gestützt auf `convert-spreadsheet` |
| `create-zip` | ZIP erstellen | - (Mehrfachdatei, 2-50 Dateien) |
| `extract-zip` | ZIP extrahieren | - (Bomben-geschützt) |

### HTML zu Bild {#html-to-image}

Eine Webseite als Bild erfassen. Anders als andere Tools akzeptiert dieser Endpunkt `application/json` statt multipart-Formulardaten (kein Datei-Upload erforderlich).

**Endpunkt:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `url` | string | (erforderlich) | Zu erfassende URL (nur http/https) |
| `format` | string | `"png"` | Ausgabeformat: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Qualität 1-100 (nur JPG/WebP) |
| `fullPage` | boolean | `false` | Vollständige scrollbare Seite erfassen |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Benutzerdefinierte Viewport-Breite 320-3840 |
| `viewportHeight` | number | `720` | Benutzerdefinierte Viewport-Höhe 320-2160 |

**Beispiel:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Antwort:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Tool-Unterrouten {#tool-sub-routes}

Einige Tools stellen zusätzliche Endpunkte über die Standard-`POST /api/v1/tools/<section>/<toolId>` hinaus bereit:

| Methode | Pfad | Beschreibung |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Beliebte Tool-IDs zurückgeben, mit Rückfall auf eine kuratierte Standardliste, wenn Nutzungsdaten spärlich sind |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Hintergrundeffekte (color/gradient/blur/shadow) anwenden, ohne die KI erneut auszuführen. Verwendet die zwischengespeicherte Maske aus der ursprünglichen Entfernung. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Vorhandene EXIF/IPTC/XMP-Metadaten aus einem Bild lesen |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Metadatenfelder vor dem Entfernen prüfen |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Phase 1: KI-Gesichtserkennung + Hintergrundentfernung. Gibt Gesichts-Landmarken und zwischengespeicherte Daten zurück. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Phase 2: Zuschneiden, Größe ändern und Kacheln mit zwischengespeicherter Analyse. Keine erneute KI-Ausführung. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | GIF-Metadaten abrufen (Frame-Anzahl, Abmessungen, Dauer) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | PDF-Metadaten abrufen (Seitenanzahl, Abmessungen) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Eine Vorschau einer bestimmten PDF-Seite erzeugen |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | PDF-Metadaten für das dedizierte JPG-Preset abrufen |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Eine JPG-Preset-PDF-Seitenvorschau erzeugen |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | PDF-Metadaten für das dedizierte PNG-Preset abrufen |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Eine PNG-Preset-PDF-Seitenvorschau erzeugen |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | PDF-Metadaten für das dedizierte TIFF-Preset abrufen |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Eine TIFF-Preset-PDF-Seitenvorschau erzeugen |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Mehrere SVGs im Stapel in Raster konvertieren |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Bildqualität analysieren und Verbesserungsempfehlungen zurückgeben |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Leichtgewichtige Vorschau für die Live-Parameteranpassung. Gibt ein optimiertes Bild mit Größen-Headern zurück. |

## Stapelverarbeitung {#batch-processing}

Wenden Sie ein generisches batch-fähiges Tool auf mehrere Dateien gleichzeitig an. Gibt ein ZIP-Archiv zurück. Benutzerdefinierte Mehrfachdatei- oder mehrstufige Routen wie PDF-Signierung, PDF-OCR und PDF-zu-Bild-Preset-Routen verwenden ihren eigenen Endpunkt-Vertrag anstelle der generischen `/batch`-Route.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Die Nebenläufigkeit wird durch `CONCURRENT_JOBS` gesteuert (Standard: automatisch anhand der CPU-Kerne erkannt). `MAX_BATCH_SIZE` begrenzt die Anzahl der Dateien pro Stapel (Standard: 100; 0 für unbegrenzt setzen).

## Pipelines {#pipelines}

### Eine Pipeline ausführen {#execute-a-pipeline}

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

Die Ausgabe jedes Schritts ist die Eingabe des nächsten Schritts. Pipelines erlauben standardmäßig 20 Schritte, konfigurierbar über `MAX_PIPELINE_STEPS`. Setzen Sie `MAX_PIPELINE_STEPS=0`, um das Limit aufzuheben.

### Pipelines speichern und verwalten {#save-and-manage-pipelines}

| Methode | Pfad | Beschreibung |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Eine benannte Pipeline speichern (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Gespeicherte Pipelines auflisten (Admins sehen alle; Benutzer sehen eigene) |
| `DELETE` | `/api/v1/pipeline/:id` | Löschen (Eigentümer oder Admin) |
| `GET` | `/api/v1/pipeline/tools` | Tool-IDs auflisten, die für Pipeline-Schritte gültig sind |

## Fortschrittsverfolgung {#progress-tracking}

Lang laufende Jobs, eingereihte Tools, Batch-Jobs und Pipelines geben Echtzeit-Fortschritt über Server-Sent Events aus. Der Fortschritts-Stream ist öffentlich und wird über die Job-ID gekennzeichnet, sodass Clients keinen Authorization-Header senden müssen, um ihn zu lesen.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Ereignisformat:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Sie können den Abbruch eines eingereihten oder laufenden Jobs mit `POST /api/v1/jobs/:jobId/cancel` anfordern. Die Antwort ist `{"canceled":true|false}`.

## Dateibibliothek {#file-library}

Dauerhafte Dateispeicherung mit Versionsverlauf.

| Methode | Pfad | Beschreibung |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Dateien in den Arbeitsbereich hochladen (temporäre Verarbeitung) |
| `POST` | `/api/v1/files/upload` | Dateien in die dauerhafte Dateibibliothek hochladen |
| `POST` | `/api/v1/files/save-result` | Ein Tool-Verarbeitungsergebnis als neue Dateiversion speichern |
| `GET` | `/api/v1/files` | Gespeicherte Dateien auflisten (paginiert, mit Suche) |
| `GET` | `/api/v1/files/:id` | Dateimetadaten + Versionskette abrufen |
| `GET` | `/api/v1/files/:id/download` | Datei herunterladen |
| `GET` | `/api/v1/files/:id/thumbnail` | 300px-JPEG-Thumbnail abrufen |
| `DELETE` | `/api/v1/files` | Dateien und ihre Versionsketten massenhaft löschen (Body: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Remote-URLs in den Arbeitsbereich abrufen für URL-basierte Importe |
| `POST` | `/api/v1/preview` | Eine browserkompatible WebP-Vorschau erzeugen (für HEIC/HEIF/RAW-Formate) |
| `GET` | `/api/v1/files/:id/preview` | Eine zwischengespeicherte oder erzeugte browserkompatible Vorschau für eine gespeicherte PDF-, Office-Dokument-, Video- oder Audiodatei streamen |
| `POST` | `/api/v1/preview/generate` | Eine On-Demand-MP4- oder -MP3-Vorschau für eine hochgeladene Mediendatei erzeugen, ohne sie zuerst zu speichern |
| `GET` | `/api/v1/download/:jobId/:filename` | Eine verarbeitete Datei aus einem Arbeitsbereich herunterladen |

Um ein Tool-Ergebnis automatisch in der Bibliothek zu speichern, fügen Sie `fileId` als multipart-Formularfeld hinzu, das auf eine vorhandene Bibliotheksdatei verweist. Das verarbeitete Ergebnis wird als neue Version gespeichert.

## API-Schlüssel-Verwaltung {#api-key-management}

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Neuen Schlüssel generieren - einmal angezeigt |
| `GET` | `/api/v1/api-keys` | Auth | Schlüssel auflisten (Name, id, lastUsedAt - nicht der Rohschlüssel) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Schlüssel löschen |

## Teams {#teams}

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Teams auflisten |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Team erstellen |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Team umbenennen |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Team löschen (Standard-Team oder Teams mit Mitgliedern können nicht gelöscht werden) |

## Einstellungen {#settings}

Laufzeit-Schlüssel-Wert-Konfiguration (von jedem authentifizierten Benutzer lesbar, nur vom Admin schreibbar).

| Methode | Pfad | Beschreibung |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Alle Einstellungen abrufen |
| `PUT` | `/api/v1/settings` | Einstellungen massenhaft aktualisieren (JSON-Body mit Schlüssel-Wert-Paaren) |
| `GET` | `/api/v1/settings/:key` | Eine bestimmte Einstellung nach Schlüssel abrufen |

Bekannte Schlüssel: `disabledTools` (JSON-Array von Tool-IDs), `enableExperimentalTools` (bool-String), `loginAttemptLimit` (Zahl).

## Einstellungen (Preferences) {#preferences}

Benutzerspezifische Einstellungen sind von den Instanzeinstellungen getrennt. Jeder authentifizierte Benutzer kann seine eigene Einstellungs-Map lesen und aktualisieren.

| Methode | Pfad | Beschreibung |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Die Einstellungen des aktuellen Benutzers als `{ "preferences": { ... } }` abrufen |
| `PUT` | `/api/v1/preferences` | Einen oder mehrere Einstellungsschlüssel für den aktuellen Benutzer per Upsert setzen |

## Rollen {#roles}

Benutzerdefinierte Rollenverwaltung mit granularen Berechtigungen.

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Alle Rollen mit Benutzeranzahl auflisten |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Eine benutzerdefinierte Rolle erstellen (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Eine benutzerdefinierte Rolle aktualisieren (integrierte Rollen können nicht geändert werden) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Eine benutzerdefinierte Rolle löschen (integrierte Rollen können nicht gelöscht werden; betroffene Benutzer fallen auf die Rolle `user` zurück) |

Verfügbare Berechtigungen (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Audit-Log {#audit-log}

Nur für Admins verfügbarer Endpunkt zur Überprüfung sicherheitsrelevanter Aktionen.

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Paginiertes Audit-Log mit optionalen Filtern |

Abfrageparameter:

| Parameter | Beschreibung |
|-----------|-------------|
| `page` | Seitennummer (Standard: 1) |
| `limit` | Einträge pro Seite (Standard: 50, max.: 100) |
| `action` | Nach Aktionstyp filtern (z.B. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Nach Quell-IP-Adresse filtern |
| `from` | Einträge nach diesem ISO-8601-Datum filtern |
| `to` | Einträge vor diesem ISO-8601-Datum filtern |

## Analytics {#analytics}

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Öffentlich | Die effektive Analytics-Konfiguration abrufen (PostHog-Schlüssel, Sentry-DSN, Abtastrate). Schlüssel, DSN und Instanz-ID sind leer, wenn Analytics deaktiviert ist, entweder durch das Kompilierzeit-Baking oder die Instanzeinstellung `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Auth | Explizites Benutzer-Feedback an das konfigurierte PostHog-Projekt als `feedback_submitted` übermitteln. Die Route beachtet das Analytics-Gate, begrenzt die Übermittlungsrate, entfernt Kontaktfelder, sofern `contactOk` nicht true ist, und akzeptiert niemals Dateiinhalte, Dateinamen, Upload-Pfade oder rohen privaten Fehlertext. Wenn Analytics deaktiviert ist, gibt sie `{ "ok": true, "accepted": false }` zurück. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Den instanzweiten Opt-out setzen. Senden Sie einen JSON-Body `{ "analyticsEnabled": "false" }`, um Analytics für alle zu deaktivieren, oder `"true"`, um es wieder zu aktivieren. |

## Features / KI-Bundles {#features-ai-bundles}

KI-Feature-Bundles verwalten (KI-Modellpakete in der Docker-Umgebung installieren/deinstallieren). Bevorzugen Sie den Tool-Level-Installationsendpunkt, wenn Sie ein Tool aus benutzerdefinierter Automatisierung aktivieren: Einige KI-Tools benötigen mehr als ein gemeinsames Bundle, und dieser Endpunkt überspringt bereits installierte Bundles und reiht nur die fehlenden ein.

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | Alle Feature-Bundles und ihren Installationsstatus auflisten |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Ein Feature-Bundle installieren (asynchron, gibt `jobId` zur Fortschrittsverfolgung zurück) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Admin (`features:manage`) | Jedes von einem Tool benötigte Bundle installieren; gibt den Status queued/skipped pro Bundle zurück |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Ein Feature-Bundle deinstallieren und Modelldateien bereinigen |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Den gesamten Speicherplatzverbrauch der KI-Modelle abrufen |
| `POST` | `/api/v1/admin/features/import` | Admin (`features:manage`) | Ein Offline-KI-Bundle-Archiv importieren |

## Admin-Operationen {#admin-operations}

Operative Endpunkte für Observability, Support, Nutzungsberichte und Backup-Status.

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Das aktuelle Laufzeit-Log-Level lesen |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Das Laufzeit-Log-Level ändern (`fatal`, `error`, `warn`, `info`, `debug`, `trace` oder `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Prometheus-Metriken im Textformat |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Ein redigiertes diagnostisches Support-Bundle-ZIP herunterladen |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Daten des Nutzungs-Dashboards, mit optionalem Abfrageparameter `days` |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Metadaten und Aktualitätsstatus des letzten Backups lesen |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Ein abgeschlossenes Backup erfassen (`type`, optional `sizeBytes`, optional `notes`) |

## Enterprise-APIs {#enterprise-apis}

Diese Routen sind durch das zugehörige Enterprise-Feature lizenzgesteuert. Sie erfordern weiterhin die aufgeführte SnapOtter-Berechtigung.

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Audit-Einträge als JSON oder CSV mit Filtern exportieren |
| `GET` | `/api/v1/enterprise/config/export` | Admin (`system:health`) | Redigierte Instanzkonfiguration, benutzerdefinierte Rollen und Teams exportieren |
| `POST` | `/api/v1/enterprise/config/import` | Admin (`system:health`) | Konfiguration importieren, mit optionalem Probelauf |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Konfigurierte CIDR-Erlaubnisliste lesen |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | CIDR-Erlaubnisliste mit Selbstsperrungs-Prävention aktualisieren |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Legal Holds für Benutzer und Teams auflisten |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Einen Legal Hold auf einen Benutzer oder ein Team anwenden oder aufheben |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Ein SCIM-Bearer-Token generieren, einmal zurückgegeben |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Das aktuelle SCIM-Bearer-Token widerrufen |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | SIEM-Weiterleitungskonfiguration lesen |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | SIEM-Weiterleitungskonfiguration aktualisieren |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Webhook-Ziele auflisten |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Ein Webhook-Ziel erstellen |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Ein Webhook-Ziel aktualisieren |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Ein Webhook-Ziel löschen |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Eine Test-Webhook-Nutzlast senden |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Einen GDPR-Benutzerexport-Job starten |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | GDPR-Exportstatus und Download-URL lesen |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Die Daten eines Benutzers nach Bestätigung dauerhaft löschen |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Die Daten eines Teams nach Bestätigung dauerhaft löschen |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | App-, Build-, Node- und Schema-Versionsmetadaten lesen |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | Verpackte Migrationen mit angewendeten Migrationen vergleichen |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Upgrade-Bereitschaftsprüfungen ausführen |

### SCIM 2.0 {#scim-2-0}

SCIM-Discovery-Endpunkte sind öffentlich. Benutzer- und Gruppenendpunkte erfordern das oben generierte SCIM-Bearer-Token.

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Öffentlich | SCIM-Server-Fähigkeiten |
| `GET` | `/api/v1/scim/v2/Schemas` | Öffentlich | SCIM-Schema-Discovery |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Öffentlich | SCIM-Ressourcentyp-Discovery |
| `GET` | `/api/v1/scim/v2/Users` | SCIM-Token | Benutzer auflisten, mit optionalem SCIM-Filter |
| `POST` | `/api/v1/scim/v2/Users` | SCIM-Token | Einen Benutzer erstellen |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM-Token | Einen Benutzer abrufen |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM-Token | Einen Benutzer ersetzen |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM-Token | Einen Benutzer soft deaktivieren |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM-Token | Teams als SCIM-Gruppen auflisten |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM-Token | Ein Team erstellen |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM-Token | Ein Team abrufen |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM-Token | Ein Team und die Gruppenmitgliedschaft ersetzen |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM-Token | Ein Team löschen |

## Meme-Vorlagen {#meme-templates}

Unterstützende API für das Meme-Generator-Tool.

| Methode | Pfad | Zugriff | Beschreibung |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | Alle verfügbaren Meme-Vorlagen mit Textfeld-Positionen auflisten |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Vollständiges Vorlagenbild bereitstellen |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Vorlagen-Thumbnail bereitstellen |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Schriftdatei für das Rendering von Meme-Text bereitstellen |

## Fehlerantworten {#error-responses}

Alle Fehler geben JSON zurück:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Status | Bedeutung |
|--------|---------|
| 400 | Ungültige Anfrage / Validierung fehlgeschlagen |
| 401 | Nicht authentifiziert |
| 403 | Unzureichende Berechtigungen |
| 404 | Ressource nicht gefunden |
| 413 | Datei zu groß (siehe `MAX_UPLOAD_SIZE_MB`) |
| 422 | Verarbeitung nach der Validierung fehlgeschlagen |
| 429 | Ratenbegrenzt (siehe `RATE_LIMIT_PER_MIN`) |
| 501 | Erforderliches KI-Feature-Bundle ist nicht installiert (`FEATURE_NOT_INSTALLED`) |
| 500 | Interner Serverfehler |
