---
description: "KI-Engine-Referenz mit allen lokalen ML-Tools. Hintergrundentfernung, Hochskalierung, OCR, Gesichtserkennung, Fotorestaurierung und mehr."
i18n_source_hash: dd135f2e9fdb
i18n_provenance: machine
i18n_output_hash: 61f462299dc5
---

# KI-Engine-Referenz {#ai-engine-reference}

Das `@snapotter/ai`-Paket verbindet Node.js mit einem **persistenten Python-Sidecar** für alle ML-Operationen. Der Dispatcher-Prozess bleibt zwischen den Anfragen aktiv, um schnelle Warm-Start-Performance zu ermöglichen. NVIDIA CUDA wird beim Start automatisch erkannt und, sofern verfügbar, genutzt; andernfalls laufen die KI-Tools auf der CPU.

Die Beschleunigung durch Intel/AMD-iGPU über VA-API, Quick Sync oder OpenCL wird für KI-Inferenz derzeit nicht unterstützt. Das Durchreichen von `/dev/dri` in einen Container beschleunigt diese Python-Sidecar-Tools nur dann, wenn eine CUDA-fähige NVIDIA-GPU verfügbar ist.

19 Python-Sidecar-KI-Tools über vier Modalitäten hinweg (Bild, Audio, Video, Dokument), plus 2 Tools mit optionalen KI-Fähigkeiten. Alle Modelle laufen lokal - nach dem ersten Modell-Download ist keine Internetverbindung erforderlich.

## Architektur {#architecture}

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

Ein separates "docs"-Dispatcher-Profil ersetzt die KI-Allowlist durch Skripte zur Dokumentenverarbeitung (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) und überspringt die aufwendigen ML-Importe.

**Zeitüberschreitungen:** 300 s standardmäßig; OCR und BiRefNet-Hintergrundentfernung erhalten 600 s.

## Feature-Bundles {#feature-bundles}

Jedes KI-Tool erfordert die Installation eines Modell-Bundles vor der Nutzung. Bundles werden bei Bedarf über die Admin-UI oder `install_feature.py` installiert.

| Bundle | Größe | Tools |
|--------|------|-------|
| `background-removal` | 4-5 GB | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | restore-photo |
| `ocr` | 5-6 GB | ocr, ocr-pdf |
| `transcription` | ~600 MB | transcribe-audio, auto-subtitles |

---

## Hintergrundentfernung {#background-removal}

**Tool-Route:** `remove-background`  
**Modell:** rembg mit BiRefNet (Standard) oder U2-Net-Varianten

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `model` | string | - | Modellvariante (optionale Überschreibung) |
| `backgroundType` | string | `"transparent"` | Eines von: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Hex-Farbe für einfarbigen Hintergrund |
| `gradientColor1` | string | - | Erste Verlaufsfarbe |
| `gradientColor2` | string | - | Zweite Verlaufsfarbe |
| `gradientAngle` | number | - | Verlaufswinkel in Grad |
| `blurEnabled` | boolean | - | Hintergrund-Unschärfeeffekt aktivieren |
| `blurIntensity` | number (0-100) | - | Unschärfe-Intensität |
| `shadowEnabled` | boolean | - | Schlagschatten am Motiv aktivieren |
| `shadowOpacity` | number (0-100) | - | Schatten-Deckkraft |
| `outputFormat` | string | - | Ausgabeformat: `png`, `webp` oder `avif` |
| `edgeRefine` | integer (0-3) | - | Stufe der Kantenverfeinerung |
| `decontaminate` | boolean | - | Farbüberlauf an den Kanten entfernen |

## Hintergrund ersetzen {#background-replace}

**Tool-Route:** `background-replace`  
**Modell:** rembg / BiRefNet (gemeinsam mit remove-background genutzt)

Entfernt den Hintergrund und ersetzt ihn durch eine einfarbige Farbe oder einen Verlauf.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Hintergrundmodus |
| `color` | string | `"#ffffff"` | Hex-Farbe des Hintergrunds (wenn `backgroundType` gleich `color`) |
| `gradientColor1` | string | - | Erste Verlaufs-Hex-Farbe |
| `gradientColor2` | string | - | Zweite Verlaufs-Hex-Farbe |
| `gradientAngle` | integer (0-360) | `180` | Verlaufswinkel in Grad |
| `feather` | integer (0-20) | `0` | Radius der Kantenweichzeichnung |
| `format` | `"png"` \| `"webp"` | `"png"` | Ausgabeformat |

## Hintergrund weichzeichnen {#blur-background}

**Tool-Route:** `blur-background`  
**Modell:** rembg / BiRefNet (gemeinsam mit remove-background genutzt)

Zeichnet den Hintergrund weich und hält das Motiv scharf.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Unschärfe-Intensität |
| `feather` | integer (0-20) | `0` | Radius der Kantenweichzeichnung |
| `format` | `"png"` \| `"webp"` | `"png"` | Ausgabeformat |

## Bild-Hochskalierung {#image-upscaling}

**Tool-Route:** `upscale`  
**Modell:** RealESRGAN (mit Lanczos-Fallback, wenn nicht verfügbar)

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Hochskalierungsfaktor |
| `model` | string | `"auto"` | Modellvariante |
| `faceEnhance` | boolean | `false` | GFPGAN-Gesichtsverbesserungsdurchlauf anwenden |
| `denoise` | number | `0` | Stärke der Rauschunterdrückung |
| `format` | string | `"auto"` | Überschreibung des Ausgabeformats |
| `quality` | number | `95` | Ausgabequalität (1-100) |

## OCR / Textextraktion {#ocr-text-extraction}

**Tool-Route:** `ocr`  
**Modelle:** Tesseract (schnell), PaddleOCR PP-OCRv5 (ausgewogen), PaddleOCR-VL 1.5 (beste Qualität)

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Verarbeitungsstufe |
| `language` | string | `"auto"` | Sprache: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Bild vorverarbeiten, um die OCR-Genauigkeit zu verbessern |
| `engine` | string | - | Veraltet. Ordnet `tesseract` auf `fast` und `paddleocr` auf `balanced` zu |

Gibt strukturierte Ergebnisse mit Begrenzungsrahmen, Konfidenzwerten und extrahierten Textblöcken zurück.

## PDF-OCR {#pdf-ocr}

**Tool-Route:** `ocr-pdf`  
**Modelle:** Gleiches Stufensystem wie bei der Bild-OCR

Extrahiert Text aus gescannten PDF-Dokumenten mittels KI-gestützter OCR, Seite für Seite.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Verarbeitungsstufe |
| `language` | string | `"auto"` | Sprache: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Seitenauswahl: `"all"`, `"1-3"`, `"1,3,5"` |

## Gesichts-/PII-Weichzeichnung {#face-pii-blur}

**Tool-Route:** `blur-faces`  
**Modell:** MediaPipe-Gesichtserkennung

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Radius der Gaußschen Unschärfe |
| `sensitivity` | number (0-1) | `0.5` | Konfidenzschwelle für die Erkennung |

## Gesichtsverbesserung {#face-enhancement}

**Tool-Route:** `enhance-faces`  
**Modelle:** GFPGAN, CodeFormer

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Verbesserungsmodell |
| `strength` | number (0-1) | `0.8` | Stärke der Verbesserung |
| `sensitivity` | number (0-1) | `0.5` | Schwelle der Gesichtserkennung |
| `onlyCenterFace` | boolean | `false` | Nur das zentralste Gesicht verbessern |

## KI-Kolorierung {#ai-colorization}

**Tool-Route:** `colorize`  
**Modell:** DDColor (mit OpenCV-DNN-Fallback)

Wandelt Schwarzweiß- oder Graustufenfotos in Vollfarbe um.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Stärke der Farbsättigung |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Modellvariante |

## Rauschentfernung {#noise-removal}

**Tool-Route:** `noise-removal`  
**Modell:** SCUNet (gestufte Entrauschungs-Pipeline)

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Verarbeitungsstufe |
| `strength` | number (0-100) | `50` | Stärke der Rauschunterdrückung |
| `detailPreservation` | number (0-100) | `50` | Wie viel Detail erhalten bleibt; höhere Werte bewahren mehr Textur |
| `colorNoise` | number (0-100) | `30` | Stärke der Farbrauschreduzierung |
| `format` | string | `"original"` | Ausgabeformat: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Qualität der Ausgabekodierung |

## Rote-Augen-Entfernung {#red-eye-removal}

**Tool-Route:** `red-eye-removal`

Erkennt Gesichtsmerkmale, lokalisiert Augenbereiche und korrigiert die Übersättigung des Rotkanals.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Schwelle für die Erkennung roter Pixel |
| `strength` | number (0-100) | `70` | Korrekturstärke |
| `format` | string | - | Überschreibung des Ausgabeformats (optional) |
| `quality` | number (1-100) | `90` | Ausgabequalität |

## Fotorestaurierung {#photo-restoration}

**Tool-Route:** `restore-photo`

Mehrstufige Pipeline für alte oder beschädigte Fotos: Erkennung und Reparatur von Kratzern/Rissen, Gesichtsverbesserung, Entrauschung und optionale Kolorierung.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Kratzer und Risse erkennen und reparieren |
| `faceEnhancement` | boolean | `true` | Gesichtsverbesserungsdurchlauf anwenden |
| `fidelity` | number (0-1) | `0.7` | Stärke der Gesichtsverbesserung (höher = konservativer) |
| `denoise` | boolean | `true` | Entrauschungsdurchlauf anwenden |
| `denoiseStrength` | number (0-100) | `25` | Stärke der Rauschunterdrückung |
| `colorize` | boolean | `false` | Nach der Restaurierung kolorieren |
| `colorizeStrength` | number (0-100) | `85` | Intensität der Kolorierung |

## Passfoto {#passport-photo}

**Tool-Route:** `passport-photo`  
**Modelle:** MediaPipe-Gesichtsmerkmale + BiRefNet-Hintergrundentfernung

Zweiphasiger Arbeitsablauf: analysieren (Gesicht erkennen + Hintergrund entfernen), dann generieren (zuschneiden, skalieren, kacheln). Unterstützt über 37 Länder in 6 Regionen.

### Phase 1: Analysieren {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Nimmt eine Bilddatei (multipart) entgegen. Gibt Gesichtsmerkmalsdaten, eine Base64-Vorschau und Bildabmessungen zurück.

### Phase 2: Generieren {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Nimmt einen JSON-Body mit den Ergebnissen aus Phase 1 plus Generierungseinstellungen entgegen:

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `jobId` | string | (erforderlich) | Job-ID aus Phase 1 |
| `filename` | string | (erforderlich) | Ursprünglicher Dateiname aus Phase 1 |
| `countryCode` | string | (erforderlich) | ISO-Ländercode (z. B. `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Dokumenttyp |
| `bgColor` | string | `"#FFFFFF"` | Hintergrundfarbe als Hex-Wert |
| `printLayout` | string | `"none"` | Drucklayout: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Maximale Dateigröße in KB (0 = keine Begrenzung) |
| `dpi` | number (72-1200) | `300` | Ausgabe-DPI |
| `customWidthMm` | number | - | Benutzerdefinierte Breite in mm (überschreibt die Länderspezifikation) |
| `customHeightMm` | number | - | Benutzerdefinierte Höhe in mm (überschreibt die Länderspezifikation) |
| `zoom` | number (0.5-3) | `1` | Zoomfaktor |
| `adjustX` | number | `0` | Anpassung der horizontalen Position |
| `adjustY` | number | `0` | Anpassung der vertikalen Position |
| `landmarks` | object | (erforderlich) | Merkmale aus Phase 1 |
| `imageWidth` | number | (erforderlich) | Bildbreite aus Phase 1 |
| `imageHeight` | number | (erforderlich) | Bildhöhe aus Phase 1 |

## Objekte entfernen (Inpainting) {#object-erasing-inpainting}

**Tool-Route:** `erase-object`  
**Modell:** LaMa über ONNX Runtime

Die Maske wird als **zweiter Dateiteil** (Feldname `mask`) gesendet, nicht als Base64. Weiße Pixel in der Maske kennzeichnen die zu entfernenden Bereiche. Die Einstellungen `format` und `quality` werden als Formularfelder auf oberster Ebene gesendet.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `file` | file | (erforderlich) | Quellbild (multipart) |
| `mask` | file | (erforderlich) | Maskenbild (multipart, Feldname `mask`, weiß = entfernen) |
| `format` | string | `"auto"` | Ausgabeformat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Ausgabequalität |

CUDA-beschleunigt, wenn eine NVIDIA-GPU verfügbar ist.

## KI-Leinwanderweiterung {#ai-canvas-expand}

**Tool-Route:** `ai-canvas-expand`  
**Modell:** LaMa-basiertes Outpainting

Erweitert die Leinwand eines Bildes in jede beliebige Richtung und füllt neue Bereiche mit KI-generiertem Inhalt, der zum bestehenden Bild passt.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Pixel zur Erweiterung oben |
| `extendRight` | integer | `0` | Pixel zur Erweiterung rechts |
| `extendBottom` | integer | `0` | Pixel zur Erweiterung unten |
| `extendLeft` | integer | `0` | Pixel zur Erweiterung links |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Qualitätsstufe |
| `format` | string | `"auto"` | Ausgabeformat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Ausgabequalität |

Mindestens eine Erweiterungsrichtung muss größer als 0 sein.

## Intelligenter Zuschnitt {#smart-crop}

**Tool-Route:** `smart-crop`  
**Modell:** MediaPipe-Gesichtserkennung (nur im Gesichtsmodus)

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Zuschnittstrategie: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Strategie für den Motivmodus |
| `width` | integer | - | Ausgabebreite |
| `height` | integer | - | Ausgabehöhe |
| `padding` | integer (0-50) | `0` | Innenabstand in Prozent um das Motiv |
| `facePreset` | string | `"head-shoulders"` | Voreingestellte Rahmung bei `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Schwelle der Gesichtserkennung |
| `threshold` | integer (0-255) | `30` | Schwelle der Hintergrunderkennung (Trim-Modus) |
| `padToSquare` | boolean | `false` | Zugeschnittenes Ergebnis auf ein Quadrat auffüllen |
| `padColor` | string | `"#ffffff"` | Hintergrundfarbe für die quadratische Auffüllung |
| `targetSize` | integer | - | Zielgröße für die aufgefüllte Ausgabe (Pixel) |
| `quality` | integer (1-100) | - | Ausgabequalität |

Alte `mode`-Werte `attention` und `content` werden akzeptiert und auf `subject` bzw. `trim` abgebildet.

**Gesichts-Voreinstellungen:**

| Voreinstellung | Am besten geeignet für |
|--------|---------|
| `closeup` | Kopfaufnahmen |
| `head-shoulders` | Profilfotos |
| `upper-body` | LinkedIn / formell |
| `half-body` | Gesamter Oberkörper |

## Audio transkribieren {#transcribe-audio}

**Tool-Route:** `transcribe-audio`  
**Modell:** faster-whisper

Wandelt Sprache in Text um. Unterstützt die Ausgabeformate reiner Text, SRT und VTT.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Sprache: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Ausgabeformat |

## Automatische Untertitel {#auto-subtitles}

**Tool-Route:** `auto-subtitles`  
**Modell:** faster-whisper (extrahiert Audio aus Video, transkribiert es dann)

Erzeugt Untertiteldateien aus der Audiospur eines Videos.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Sprache: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Ausgabeformat der Untertitel |

## PNG-Transparenz-Korrektur {#png-transparency-fixer}

**Tool-Route:** `transparency-fixer`  
**Modell:** BiRefNet HR-Matting (Auflösung 2048x2048)

Korrigiert "unecht transparente" PNGs, bei denen der Hintergrund entfernt wurde, aber Farbränder, Höfe oder halbtransparente Artefakte zurückgeblieben sind. Nutzt das hochauflösende Matting-Modell von BiRefNet, um einen sauberen Alphakanal zu erzeugen, und wendet anschließend eine konfigurierbare Defringe-Verarbeitung an, um Farbverunreinigungen entlang der Kanten zu entfernen.

**OOM-Fallback-Kette:** Übersteigt das BiRefNet-HR-Matting den verfügbaren Speicher, greift das Tool automatisch auf `birefnet-general` und dann auf `u2net` zurück.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Stärke des Kanten-Defringe zur Entfernung von Farbverunreinigungen |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Ausgabebildformat |
| `removeWatermark` | boolean | `false` | Vorverarbeitung zur Wasserzeichenentfernung anwenden (Medianfilter) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Tools mit optionalen KI-Fähigkeiten {#tools-with-optional-ai-capabilities}

Die folgenden Tools sind keine Python-Sidecar-Tools, nutzen aber KI-Funktionen, wenn bestimmte Optionen aktiviert sind.

### Bildverbesserung {#image-enhancement}

**Tool-Route:** `image-enhancement`  
**Engine:** Analysebasiert (Sharp-Histogramm und -Statistiken)

Analysiert das Bild und wendet automatische Korrekturen für Belichtung, Kontrast, Weißabgleich, Sättigung, Schärfe und Rauschen an. Unterstützt szenenspezifische Modi.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Szenenmodus zur Feinabstimmung der Korrekturen |
| `intensity` | number (0-100) | `50` | Gesamtstärke der Korrektur |
| `corrections.exposure` | boolean | `true` | Belichtungskorrektur anwenden |
| `corrections.contrast` | boolean | `true` | Kontrastkorrektur anwenden |
| `corrections.whiteBalance` | boolean | `true` | Weißabgleichkorrektur anwenden |
| `corrections.saturation` | boolean | `true` | Sättigungskorrektur anwenden |
| `corrections.sharpness` | boolean | `true` | Schärfekorrektur anwenden |
| `corrections.denoise` | boolean | `true` | Entrauschung anwenden |
| `deepEnhance` | boolean | `false` | KI-Rauschentfernung über SCUNet aktivieren (erfordert `upscale-enhance`-Bundle) |

Ein zusätzlicher Analyse-Endpunkt ist unter `POST /api/v1/tools/image/image-enhancement/analyze` verfügbar, der die erkannten Korrekturen zurückgibt, ohne sie anzuwenden.

### Inhaltsbasierte Größenänderung (Seam Carving) {#content-aware-resize-seam-carving}

**Tool-Route:** `content-aware-resize`  
**Engine:** Go-Binärdatei `caire` (kein Python - kein GPU-Vorteil)

Ändert die Bildgröße intelligent, indem Nähte mit geringer Energie entfernt werden, wobei wichtige Inhalte erhalten bleiben.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `width` | number | - | Zielbreite |
| `height` | number | - | Zielhöhe |
| `protectFaces` | boolean | `false` | Erkannte Gesichtsbereiche schützen (erfordert `face-detection`-Bundle) |
| `blurRadius` | number (0-20) | `4` | Vorab-Weichzeichnung für die Energieberechnung |
| `sobelThreshold` | number (1-20) | `2` | Schwelle der Kantenempfindlichkeit |
| `square` | boolean | `false` | Quadratische Ausgabe erzwingen |
