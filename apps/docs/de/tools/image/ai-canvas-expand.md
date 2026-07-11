---
description: "Eine Bildleinwand mit KI-Outpainting erweitern, sie in jede Richtung ausdehnen und die neuen Bereiche passend zum Original füllen."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 03d5eb6cf636
---

# KI-Leinwand erweitern {#ai-canvas-expand}

Erweitert die Leinwand eines Bildes mit KI-gestützter Füllung (Outpainting). Dehnt das Bild in jede Richtung aus und füllt die neuen Bereiche mit KI-generiertem Inhalt, der zum vorhandenen Bild passt.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Verarbeitung:** Asynchron (gibt 202 zurück, `/api/v1/jobs/{jobId}/progress` per SSE nach dem Status abfragen)

**Modellpaket:** `object-eraser-colorize` (1-2 GB)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (multipart) |
| extendTop | integer | Nein | `0` | Pixel, um die oben erweitert wird |
| extendRight | integer | Nein | `0` | Pixel, um die rechts erweitert wird |
| extendBottom | integer | Nein | `0` | Pixel, um die unten erweitert wird |
| extendLeft | integer | Nein | `0` | Pixel, um die links erweitert wird |
| tier | string | Nein | `"balanced"` | Qualitätsstufe: `fast`, `balanced`, `high` |
| format | string | Nein | `"auto"` | Ausgabeformat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Nein | `95` | Ausgabequalität (1-100) |

Mindestens eine Erweiterungsrichtung muss größer als 0 sein.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## Antwort {#response}

### Erste Antwort (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Fortschritt (SSE unter `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Endergebnis (per SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Hinweise {#notes}

- Erfordert die Installation des Modellpakets `object-eraser-colorize` (1-2 GB).
- Verwendet LaMa-basiertes Outpainting, um Inhalt für die erweiterten Bereiche zu erzeugen.
- Der Parameter `tier` tauscht Geschwindigkeit gegen Qualität: `fast` liefert schnell Ergebnisse mit möglichen Artefakten, `high` dauert länger, erzeugt aber sanftere, stimmigere Füllungen.
- Die Erweiterungswerte sind in Pixeln angegeben. Die endgültigen Bildabmessungen betragen: ursprüngliche Breite + extendLeft + extendRight auf ursprüngliche Höhe + extendTop + extendBottom.
- Für Ausgabeformate, die sich nicht im Browser vorschauen lassen (HEIC, JXL, TIFF), wird neben der Hauptausgabe eine WebP-Vorschau erzeugt.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR über automatische Dekodierung.
