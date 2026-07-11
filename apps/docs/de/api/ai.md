---
description: "KI-Engine-Referenz mit allen lokalen ML-Werkzeugen. Hintergrundentfernung, Hochskalierung, OCR, Gesichtserkennung, Fotorestaurierung und mehr."
i18n_source_hash: 14728c1dcd05
i18n_provenance: machine
i18n_output_hash: 00f94aaf3764
---

# KI-Engine-Referenz {#ai-engine-reference}

Das `@snapotter/ai`-Paket verbindet Node.js mit einem **dauerhaften Python-Sidecar** für alle ML-Operationen. Der Dispatcher-Prozess bleibt zwischen Anfragen aktiv, was einen schnellen Warmstart ermöglicht. NVIDIA CUDA wird beim Start automatisch erkannt und, sofern verfügbar, genutzt; andernfalls laufen KI-Werkzeuge auf der CPU.

Eine iGPU-Beschleunigung von Intel/AMD über VA-API, Quick Sync oder OpenCL wird für KI-Inferenz derzeit nicht unterstützt. Das Durchreichen von `/dev/dri` in einen Container beschleunigt diese Python-Sidecar-Werkzeuge nicht, sofern keine CUDA-fähige NVIDIA-GPU verfügbar ist.

19 KI-Werkzeuge im Python-Sidecar über vier Modalitäten hinweg (Bild, Audio, Video, Dokument), plus 2 Werkzeuge mit optionalen KI-Fähigkeiten. Alle Modelle laufen lokal - nach dem ersten Modell-Download ist kein Internet erforderlich.

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

Ein separates "docs"-Dispatcher-Profil ersetzt die KI-Zulassungsliste durch Skripte zur Dokumentenverarbeitung (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) und überspringt die aufwendigen ML-Importe.

**Zeitüberschreitungen:** 300 s standardmäßig; OCR und die BiRefNet-Hintergrundentfernung erhalten 600 s.

## Feature-Bundles {#feature-bundles}

KI-Modelle werden nach gemeinsamem Abhängigkeits-Stack gebündelt, nicht als ein Archiv pro Werkzeug. Ein Feature-Bundle kann mehrere Werkzeuge aktivieren, wenn diese dieselbe Modellfamilie, dieselben Python-Wheels oder dieselben nativen Bibliotheken verwenden. Das hält das Release-Docker-Image kleiner und vermeidet doppelte Kopien derselben Modelle für Hintergrund-Matting, Gesichtserkennung, OCR, Restaurierung und Sprache.

Das Docker-Image liefert die Anwendung sowie die gemeinsame Laufzeitumgebung. Große Modellarchive werden bei Bedarf in das dauerhafte `/data/ai`-Volume heruntergeladen und dann von jedem Werkzeug wiederverwendet, das sie benötigt. Wenn ein Bundle bereits installiert ist, weil ein anderes Werkzeug es benötigt hat, lädt das Aktivieren eines neuen abhängigen Werkzeugs dieses Bundle nicht erneut herunter.

Jedes KI-Werkzeug benötigt ein oder mehrere Feature-Bundles, bevor es ausgeführt werden kann. Die Admin-Oberfläche installiert werkzeugbezogen über `POST /api/v1/admin/tools/:toolId/features/install`, das die vollständige Bundle-Liste auflöst, bereits installierte Bundles überspringt und nur die fehlenden Downloads in die Warteschlange stellt. Zum Beispiel stellt das Aktivieren von Passfoto auf einer frischen Instanz `background-removal` und `face-detection` in die Warteschlange; wird es aktiviert, nachdem Hintergrundentfernung bereits installiert ist, wird nur `face-detection` in die Warteschlange gestellt.

| Bundle | Größe | Gemeinsame Abhängigkeitsgruppe | Werkzeuge, die es nutzen |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet Hintergrund-Matting | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | MediaPipe Gesichtserkennung und Landmarken | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa Inpainting/Outpainting und DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, Rauschunterdrückung | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | Kratzerreparatur und Restaurierungs-Pipeline | restore-photo |
| `ocr` | 5-6 GB | PaddleOCR / Tesseract OCR-Stack | ocr, ocr-pdf |
| `transcription` | ~600 MB | faster-whisper Sprache-zu-Text-Modelle | transcribe-audio, auto-subtitles |

Werkzeuge mit bundleübergreifenden Abhängigkeiten:

| Werkzeug | Erforderliche Bundles | Grund |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Entfernt den Hintergrund und verwendet dann Gesichtslandmarken, um den Zuschnitt gemäß den Regeln für Pass- und Ausweisfotos auszurichten. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Erkennt Gesichter, bevor es GFPGAN oder CodeFormer zur Verbesserung der ausgewählten Gesichtsbereiche ausführt. |

Ein Werkzeug ist nur verfügbar, wenn alle erforderlichen Bundles installiert sind. Teilinstallationen sind gültig und werden inkrementell behandelt: installierte Bundles werden wiederverwendet, fehlende Bundles werden als Downloads angezeigt, und Installationen in der Warteschlange werden nacheinander ausgeführt, damit die gemeinsame Python-Umgebung nicht gleichzeitig verändert wird.

---

## Hintergrundentfernung {#background-removal}

**Werkzeug-Route:** `remove-background`  
**Modell:** rembg mit BiRefNet (Standard) oder U2-Net-Varianten

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `model` | string | - | Modellvariante (optionale Überschreibung) |
| `backgroundType` | string | `"transparent"` | Eines von: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Hex-Farbe für einfarbigen Hintergrund |
| `gradientColor1` | string | - | Erste Verlaufsfarbe |
| `gradientColor2` | string | - | Zweite Verlaufsfarbe |
| `gradientAngle` | number | - | Verlaufswinkel in Grad |
| `blurEnabled` | boolean | - | Hintergrundunschärfe-Effekt aktivieren |
| `blurIntensity` | number (0-100) | - | Unschärfeintensität |
| `shadowEnabled` | boolean | - | Schlagschatten am Motiv aktivieren |
| `shadowOpacity` | number (0-100) | - | Schattendeckkraft |
| `outputFormat` | string | - | Ausgabeformat: `png`, `webp` oder `avif` |
| `edgeRefine` | integer (0-3) | - | Grad der Kantenverfeinerung |
| `decontaminate` | boolean | - | Farbränder an den Kanten entfernen |

## Hintergrund ersetzen {#background-replace}

**Werkzeug-Route:** `background-replace`  
**Modell:** rembg / BiRefNet (gemeinsam mit remove-background)

Entfernt den Hintergrund und ersetzt ihn durch eine einfarbige Fläche oder einen Verlauf.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Hintergrundmodus |
| `color` | string | `"#ffffff"` | Hintergrund-Hex-Farbe (wenn `backgroundType` gleich `color` ist) |
| `gradientColor1` | string | - | Erste Verlaufs-Hex-Farbe |
| `gradientColor2` | string | - | Zweite Verlaufs-Hex-Farbe |
| `gradientAngle` | integer (0-360) | `180` | Verlaufswinkel in Grad |
| `feather` | integer (0-20) | `0` | Radius der Kantenweichzeichnung |
| `format` | `"png"` \| `"webp"` | `"png"` | Ausgabeformat |

## Hintergrund weichzeichnen {#blur-background}

**Werkzeug-Route:** `blur-background`  
**Modell:** rembg / BiRefNet (gemeinsam mit remove-background)

Zeichnet den Hintergrund weich und hält das Motiv scharf.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Unschärfeintensität |
| `feather` | integer (0-20) | `0` | Radius der Kantenweichzeichnung |
| `format` | `"png"` \| `"webp"` | `"png"` | Ausgabeformat |

## Bildhochskalierung {#image-upscaling}

**Werkzeug-Route:** `upscale`  
**Modell:** RealESRGAN (mit Lanczos-Fallback, wenn nicht verfügbar)

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Hochskalierungsfaktor |
| `model` | string | `"auto"` | Modellvariante |
| `faceEnhance` | boolean | `false` | GFPGAN-Durchgang zur Gesichtsverbesserung anwenden |
| `denoise` | number | `0` | Stärke der Rauschunterdrückung |
| `format` | string | `"auto"` | Überschreibung des Ausgabeformats |
| `quality` | number | `95` | Ausgabequalität (1-100) |

## OCR / Textextraktion {#ocr-text-extraction}

**Werkzeug-Route:** `ocr`  
**Modelle:** Tesseract (schnell), PaddleOCR PP-OCRv5 (ausgewogen), PaddleOCR-VL 1.5 (beste)

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Verarbeitungsstufe |
| `language` | string | `"auto"` | Sprache: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Bild vorverarbeiten, um die OCR-Genauigkeit zu verbessern |
| `engine` | string | - | Veraltet. Bildet `tesseract` auf `fast` ab, `paddleocr` auf `balanced` |

Gibt strukturierte Ergebnisse mit Begrenzungsrahmen, Konfidenzwerten und extrahierten Textblöcken zurück.

## PDF-OCR {#pdf-ocr}

**Werkzeug-Route:** `ocr-pdf`  
**Modelle:** Dasselbe Stufensystem wie bei der Bild-OCR

Extrahiert Text aus gescannten PDF-Dokumenten mittels KI-gestützter OCR, Seite für Seite.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Verarbeitungsstufe |
| `language` | string | `"auto"` | Sprache: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Seitenauswahl: `"all"`, `"1-3"`, `"1,3,5"` |

## Gesichts- / PII-Weichzeichnung {#face-pii-blur}

**Werkzeug-Route:** `blur-faces`  
**Modell:** MediaPipe-Gesichtserkennung

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Radius der Gaußschen Weichzeichnung |
| `sensitivity` | number (0-1) | `0.5` | Konfidenzschwelle der Erkennung |

## Gesichtsverbesserung {#face-enhancement}

**Werkzeug-Route:** `enhance-faces`  
**Modelle:** GFPGAN, CodeFormer

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Verbesserungsmodell |
| `strength` | number (0-1) | `0.8` | Verbesserungsstärke |
| `sensitivity` | number (0-1) | `0.5` | Schwellenwert der Gesichtserkennung |
| `onlyCenterFace` | boolean | `false` | Nur das zentralste Gesicht verbessern |

## KI-Kolorierung {#ai-colorization}

**Werkzeug-Route:** `colorize`  
**Modell:** DDColor (mit OpenCV-DNN-Fallback)

Wandelt Schwarz-Weiß- oder Graustufenfotos in Vollfarbe um.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Stärke der Farbsättigung |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Modellvariante |

## Rauschentfernung {#noise-removal}

**Werkzeug-Route:** `noise-removal`  
**Modell:** SCUNet (gestufte Rauschunterdrückungs-Pipeline)

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Verarbeitungsstufe |
| `strength` | number (0-100) | `50` | Stärke der Rauschunterdrückung |
| `detailPreservation` | number (0-100) | `50` | Wie viele Details erhalten bleiben; höher bewahrt mehr Textur |
| `colorNoise` | number (0-100) | `30` | Stärke der Farbrauschreduzierung |
| `format` | string | `"original"` | Ausgabeformat: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Qualität der Ausgabekodierung |

## Rote-Augen-Entfernung {#red-eye-removal}

**Werkzeug-Route:** `red-eye-removal`

Erkennt Gesichtslandmarken, lokalisiert Augenbereiche und korrigiert die Übersättigung des Rotkanals.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Schwellenwert zur Erkennung roter Pixel |
| `strength` | number (0-100) | `70` | Korrekturstärke |
| `format` | string | - | Überschreibung des Ausgabeformats (optional) |
| `quality` | number (1-100) | `90` | Ausgabequalität |

## Fotorestaurierung {#photo-restoration}

**Werkzeug-Route:** `restore-photo`

Mehrstufige Pipeline für alte oder beschädigte Fotos: Erkennung und Reparatur von Kratzern/Rissen, Gesichtsverbesserung, Rauschunterdrückung und optionale Kolorierung.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Kratzer und Risse erkennen und reparieren |
| `faceEnhancement` | boolean | `true` | Durchgang zur Gesichtsverbesserung anwenden |
| `fidelity` | number (0-1) | `0.7` | Stärke der Gesichtsverbesserung (höher = konservativer) |
| `denoise` | boolean | `true` | Durchgang zur Rauschunterdrückung anwenden |
| `denoiseStrength` | number (0-100) | `25` | Stärke der Rauschunterdrückung |
| `colorize` | boolean | `false` | Nach der Restaurierung kolorieren |
| `colorizeStrength` | number (0-100) | `85` | Kolorierungsintensität |

## Passfoto {#passport-photo}

**Werkzeug-Route:** `passport-photo`  
**Modelle:** MediaPipe-Gesichtslandmarken + BiRefNet-Hintergrundentfernung

Zweiphasiger Ablauf: analysieren (Gesicht erkennen + Hintergrund entfernen), dann generieren (zuschneiden, skalieren, kacheln). Unterstützt über 37 Länder in 6 Regionen.

### Phase 1: Analysieren {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Nimmt eine Bilddatei entgegen (multipart). Gibt Gesichtslandmarkendaten, eine Base64-Vorschau und Bildabmessungen zurück.

### Phase 2: Generieren {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Nimmt einen JSON-Body mit den Ergebnissen aus Phase 1 sowie den Generierungseinstellungen entgegen:

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `jobId` | string | (erforderlich) | Job-ID aus Phase 1 |
| `filename` | string | (erforderlich) | Ursprünglicher Dateiname aus Phase 1 |
| `countryCode` | string | (erforderlich) | ISO-Ländercode (z. B. `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Dokumententyp |
| `bgColor` | string | `"#FFFFFF"` | Hintergrundfarbe als Hex |
| `printLayout` | string | `"none"` | Druck-Layout: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Maximale Dateigröße in KB (0 = kein Limit) |
| `dpi` | number (72-1200) | `300` | Ausgabe-DPI |
| `customWidthMm` | number | - | Benutzerdefinierte Breite in mm (überschreibt die Länderspezifikation) |
| `customHeightMm` | number | - | Benutzerdefinierte Höhe in mm (überschreibt die Länderspezifikation) |
| `zoom` | number (0.5-3) | `1` | Zoomfaktor |
| `adjustX` | number | `0` | Horizontale Positionsanpassung |
| `adjustY` | number | `0` | Vertikale Positionsanpassung |
| `landmarks` | object | (erforderlich) | Landmarken aus Phase 1 |
| `imageWidth` | number | (erforderlich) | Bildbreite aus Phase 1 |
| `imageHeight` | number | (erforderlich) | Bildhöhe aus Phase 1 |

## Objekte entfernen (Inpainting) {#object-erasing-inpainting}

**Werkzeug-Route:** `erase-object`  
**Modell:** LaMa über ONNX Runtime

Die Maske wird als **zweiter Dateibestandteil** gesendet (Feldname `mask`), nicht als Base64. Weiße Pixel in der Maske kennzeichnen die zu entfernenden Bereiche. Die Einstellungen `format` und `quality` werden als Formularfelder auf oberster Ebene gesendet.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `file` | file | (erforderlich) | Quellbild (multipart) |
| `mask` | file | (erforderlich) | Maskenbild (multipart, Feldname `mask`, weiß = entfernen) |
| `format` | string | `"auto"` | Ausgabeformat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Ausgabequalität |

CUDA-beschleunigt, wenn eine NVIDIA-GPU verfügbar ist.

## KI-Leinwanderweiterung {#ai-canvas-expand}

**Werkzeug-Route:** `ai-canvas-expand`  
**Modell:** LaMa-basiertes Outpainting

Erweitert die Leinwand eines Bildes in jede Richtung und füllt die neuen Bereiche mit KI-generierten Inhalten, die zum bestehenden Bild passen.

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

**Werkzeug-Route:** `smart-crop`  
**Modell:** MediaPipe-Gesichtserkennung (nur im Gesichtsmodus)

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Zuschnittstrategie: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Strategie für den Motivmodus |
| `width` | integer | - | Ausgabebreite |
| `height` | integer | - | Ausgabehöhe |
| `padding` | integer (0-50) | `0` | Prozentualer Abstand um das Motiv |
| `facePreset` | string | `"head-shoulders"` | Voreingestellte Rahmung, wenn `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Schwellenwert der Gesichtserkennung |
| `threshold` | integer (0-255) | `30` | Schwellenwert der Hintergrunderkennung (Trim-Modus) |
| `padToSquare` | boolean | `false` | Getrimmtes Ergebnis auf ein Quadrat auffüllen |
| `padColor` | string | `"#ffffff"` | Hintergrundfarbe für die quadratische Auffüllung |
| `targetSize` | integer | - | Zielgröße für die aufgefüllte Ausgabe (Pixel) |
| `quality` | integer (1-100) | - | Ausgabequalität |

Die veralteten `mode`-Werte `attention` und `content` werden akzeptiert und auf `subject` bzw. `trim` abgebildet.

**Gesichts-Voreinstellungen:**

| Voreinstellung | Am besten geeignet für |
|--------|---------|
| `closeup` | Porträtaufnahmen |
| `head-shoulders` | Profilfotos |
| `upper-body` | LinkedIn / formell |
| `half-body` | Gesamter Oberkörper |

## Audio transkribieren {#transcribe-audio}

**Werkzeug-Route:** `transcribe-audio`  
**Modell:** faster-whisper

Wandelt Sprache in Text um. Unterstützt die Ausgabeformate Klartext, SRT und VTT.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Sprache: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Ausgabeformat |

## Automatische Untertitel {#auto-subtitles}

**Werkzeug-Route:** `auto-subtitles`  
**Modell:** faster-whisper (extrahiert Audio aus dem Video und transkribiert dann)

Erzeugt Untertiteldateien aus der Audiospur eines Videos.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Sprache: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Ausgabeformat der Untertitel |

## PNG-Transparenz-Korrektur {#png-transparency-fixer}

**Werkzeug-Route:** `transparency-fixer`  
**Modell:** BiRefNet HR-Matting (Auflösung 2048x2048)

Behebt "unecht transparente" PNGs, bei denen der Hintergrund entfernt wurde, aber Fransen, Halos oder halbtransparente Artefakte zurückgeblieben sind. Verwendet das hochauflösende Matting-Modell von BiRefNet, um einen sauberen Alphakanal zu erzeugen, und wendet anschließend eine konfigurierbare Defringe-Verarbeitung an, um Farbverunreinigungen entlang der Kanten zu entfernen.

**OOM-Fallback-Kette:** Überschreitet das BiRefNet HR-Matting den verfügbaren Speicher, greift das Werkzeug automatisch auf `birefnet-general` und dann auf `u2net` zurück.

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

## Werkzeuge mit optionalen KI-Fähigkeiten {#tools-with-optional-ai-capabilities}

Die folgenden Werkzeuge sind keine Python-Sidecar-Werkzeuge, nutzen aber KI-Funktionen, wenn bestimmte Optionen aktiviert sind.

### Bildverbesserung {#image-enhancement}

**Werkzeug-Route:** `image-enhancement`  
**Engine:** Analysebasiert (Sharp-Histogramm und -Statistik)

Analysiert das Bild und wendet automatische Korrekturen für Belichtung, Kontrast, Weißabgleich, Sättigung, Schärfe und Rauschen an. Unterstützt szenenspezifische Modi.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Szenenmodus zum Feinabstimmen der Korrekturen |
| `intensity` | number (0-100) | `50` | Gesamtkorrekturstärke |
| `corrections.exposure` | boolean | `true` | Belichtungskorrektur anwenden |
| `corrections.contrast` | boolean | `true` | Kontrastkorrektur anwenden |
| `corrections.whiteBalance` | boolean | `true` | Weißabgleichskorrektur anwenden |
| `corrections.saturation` | boolean | `true` | Sättigungskorrektur anwenden |
| `corrections.sharpness` | boolean | `true` | Schärfekorrektur anwenden |
| `corrections.denoise` | boolean | `true` | Rauschunterdrückung anwenden |
| `deepEnhance` | boolean | `false` | KI-Rauschentfernung über SCUNet aktivieren (erfordert das `upscale-enhance`-Bundle) |

Ein zusätzlicher Analyse-Endpunkt ist unter `POST /api/v1/tools/image/image-enhancement/analyze` verfügbar, der die erkannten Korrekturen zurückgibt, ohne sie anzuwenden.

### Inhaltsbewusste Größenänderung (Seam Carving) {#content-aware-resize-seam-carving}

**Werkzeug-Route:** `content-aware-resize`  
**Engine:** Go-Binary `caire` (kein Python - kein GPU-Vorteil)

Ändert die Größe von Bildern intelligent, indem energiearme Nähte entfernt und wichtige Inhalte erhalten werden.

| Parameter | Typ | Standard | Beschreibung |
|-----------|------|---------|-------------|
| `width` | number | - | Zielbreite |
| `height` | number | - | Zielhöhe |
| `protectFaces` | boolean | `false` | Erkannte Gesichtsbereiche schützen (erfordert das `face-detection`-Bundle) |
| `blurRadius` | number (0-20) | `4` | Vorab-Weichzeichnung für die Energieberechnung |
| `sobelThreshold` | number (1-20) | `2` | Schwellenwert der Kantenempfindlichkeit |
| `square` | boolean | `false` | Quadratische Ausgabe erzwingen |
