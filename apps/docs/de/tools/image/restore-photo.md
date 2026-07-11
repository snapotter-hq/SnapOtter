---
description: "Repariere Kratzer, Risse und Schäden an alten Fotos mit einer KI-Pipeline für Restaurierung, Gesichtsverbesserung und Farbe."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 68fa41b02608
---

# Foto-Restaurierung {#photo-restoration}

Behebe Kratzer, Risse und Schäden an alten Fotos mit einer mehrstufigen KI-Pipeline. Kombiniert Kratzerreparatur, Gesichtsverbesserung, Rauschunterdrückung und optionale Kolorierung.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Verarbeitung:** Asynchron (gibt 202 zurück, Status über SSE per `/api/v1/jobs/{jobId}/progress` abfragen)

**Modell-Bundle:** `photo-restoration` (4-5 GB)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (multipart) |
| scratchRemoval | boolean | Nein | `true` | Kratzer und Oberflächenschäden entfernen |
| faceEnhancement | boolean | Nein | `true` | Gesichter im restaurierten Foto verbessern |
| fidelity | number | Nein | `0.7` | Treue der Gesichtsverbesserung (0-1). Höhere Werte erhalten die ursprünglichen Merkmale stärker |
| denoise | boolean | Nein | `true` | Rauschunterdrückung auf das restaurierte Ergebnis anwenden |
| denoiseStrength | number | Nein | `25` | Stärke der Rauschunterdrückung (0-100) |
| colorize | boolean | Nein | `false` | Das restaurierte Foto kolorieren (für Graustufenbilder) |
| colorizeStrength | number | Nein | `85` | Intensität der Kolorierung (0-100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Endergebnis (über SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Hinweise {#notes}

- Erfordert das installierte Modell-Bundle `photo-restoration` (4-5 GB).
- Die Pipeline führt mehrere KI-Schritte nacheinander aus: Kratzerreparatur, Gesichtsverbesserung (GFPGAN), Rauschunterdrückung und optional Kolorierung.
- Das Array `steps` im Ergebnis zeigt an, welche Verarbeitungsschritte tatsächlich ausgeführt wurden.
- `scratchCoverage` ist ein geschätzter Prozentsatz der Bildfläche, die Kratzschäden aufwies.
- `fidelity` steuert, wie stark Gesichter verbessert werden im Vergleich zur Erhaltung des ursprünglichen Aussehens. Niedrigere Werte erzeugen eine aggressivere Verbesserung; höhere Werte sind konservativer.
- Die Option `colorize` erkennt automatisch, ob das Bild in Graustufen vorliegt. Das Flag `isGrayscale` im Ergebnis bestätigt diese Erkennung.
- Das Ausgabeformat entspricht automatisch dem Eingabeformat.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR, HDR und AVIF durch automatische Dekodierung.
