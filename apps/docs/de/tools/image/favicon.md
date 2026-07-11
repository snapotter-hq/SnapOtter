---
description: "Generiert alle gängigen Favicon- und App-Icon-Größen aus einem Ausgangsbild."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 2e7d1f546008
---

# Favicon-Generator {#favicon-generator}

Erzeugt einen vollständigen Satz an Favicon- und App-Icon-Dateien aus einem Ausgangsbild. Produziert alle gängigen Größen, die für Browser, Apple-Geräte und Android benötigt werden, zusammen mit einem Web-Manifest und einem HTML-Snippet.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Akzeptiert Multipart-Formulardaten mit einer oder mehreren Bilddateien und einem optionalen JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| background | string | Nein | - | Hintergrund-Hexfarbe (z. B. `"#ffffff"`). Wenn gesetzt, wird das Icon auf diese Farbe abgeflacht. |
| padding | integer | Nein | `0` | Innenabstand in Prozent um den Icon-Inhalt (0 bis 40) |
| radius | integer | Nein | `0` | Eckenradius in Prozent für abgerundete Icons (0 bis 50) |
| sizes | integer[] | Nein | - | Ausgabe auf bestimmte Pixelgrößen beschränken (z. B. `[16, 32, 180]`). Weglassen, um alle gängigen Größen zu erzeugen. |
| themeColor | string | Nein | `"#ffffff"` | Theme-Farbe als Hexwert für das Web-Manifest |

## Erzeugte Dateien {#generated-files}

Für jedes Eingabebild werden die folgenden Dateien erstellt:

| Datei | Größe | Zweck |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Browser-Tab-Icon |
| `favicon-32x32.png` | 32x32 | Browser-Tab-Icon (HiDPI) |
| `favicon-48x48.png` | 48x48 | Desktop-Verknüpfung |
| `apple-touch-icon.png` | 180x180 | iOS-Startbildschirm |
| `android-chrome-192x192.png` | 192x192 | Android-Startbildschirm |
| `android-chrome-512x512.png` | 512x512 | Android-Splash-Screen |
| `favicon.ico` | 32x32 | Klassisches ICO-Format |
| `manifest.json` | - | Web-App-Manifest mit Icon-Verweisen |
| `favicon-snippet.html` | - | Fertige HTML-Link-Tags |

## Beispielanfrage {#example-request}

Einzelnes Ausgangsbild mit abgerundeten Ecken und Innenabstand:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Mehrere Ausgangsbilder (jedes erhält seinen eigenen Satz in einem Unterordner):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Beispielantwort {#example-response}

Die Antwort ist eine ZIP-Datei, die direkt gestreamt wird. Die Antwort-Header lauten:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Enthaltenes HTML-Snippet {#html-snippet-included}

Die ZIP-Datei enthält eine Datei `favicon-snippet.html`, die Sie in den `<head>` Ihres HTML einfügen können:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Hinweise {#notes}

- Ausgangsbilder werden mit dem Fit-Modus `cover` skaliert, das heißt, sie werden zugeschnitten, um jede quadratische Größe auszufüllen. Für beste Ergebnisse verwenden Sie ein quadratisches Ausgangsbild.
- Wenn mehrere Dateien hochgeladen werden, erhält jede ihren eigenen Unterordner in der ZIP-Datei (benannt nach der Quelldatei).
- Bei einem Upload einer einzelnen Datei liegen alle Ausgaben im Stammverzeichnis der ZIP-Datei ohne Unterordner.
- Dateien, die die Validierung oder Decodierung nicht bestehen, werden übersprungen, und eine `skipped-files.txt` wird in die ZIP-Datei aufgenommen, die die Probleme erläutert.
- Unterstützte Eingabeformate: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD und mehr.
- Die EXIF-Ausrichtung wird vor dem Skalieren automatisch angewendet.
