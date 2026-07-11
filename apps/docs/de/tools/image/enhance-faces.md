---
description: "Stellt unscharfe oder minderwertige Gesichter in Bildern mit den KI-Modellen GFPGAN und CodeFormer wieder her und schärft sie nach."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 449d718385d6
---

# Gesichtsverbesserung {#face-enhancement}

Stellt Gesichter in Bildern mit KI-Modellen (GFPGAN/CodeFormer) wieder her und verbessert sie.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Verarbeitung:** Asynchron (gibt 202 zurück, Status per SSE über `/api/v1/jobs/{jobId}/progress` abfragen)

**Modell-Bundles:** `upscale-enhance` (5-6 GB) und `face-detection` (200-300 MB)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (Multipart) |
| model | string | Nein | `"auto"` | Zu verwendendes Modell: `auto`, `gfpgan`, `codeformer` |
| strength | number | Nein | `0.8` | Verbesserungsstärke (0-1). Höhere Werte erzeugen eine stärkere Verbesserung |
| onlyCenterFace | boolean | Nein | `false` | Nur das zentralste/auffälligste Gesicht verbessern |
| sensitivity | number | Nein | `0.5` | Empfindlichkeit der Gesichtserkennung (0-1) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Endergebnis (per SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Hinweise {#notes}

- Erfordert sowohl das Modell-Bundle `upscale-enhance` (5-6 GB) als auch das Modell-Bundle `face-detection` (200-300 MB).
- GFPGAN erzeugt eine aggressivere Verbesserung; CodeFormer bewahrt die Identität besser. `auto` wählt das für die Eingabe beste Modell aus.
- Die Ausgabe ist für maximale Qualität immer im PNG-Format.
- Neben der Ausgabe in voller Auflösung wird für eine schnellere Anzeige im Frontend eine WebP-Vorschau erzeugt.
- Der Parameter `strength` mischt das verbesserte Gesicht mit dem Original. Verwenden Sie niedrigere Werte (0.3-0.5) für dezente Verbesserungen, höhere Werte (0.7-1.0) für eine stärkere Wiederherstellung.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR durch automatische Dekodierung.
