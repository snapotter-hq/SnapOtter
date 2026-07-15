---
description: "Gesichter in Bildern per KI-Gesichtserkennung automatisch erkennen und weichzeichnen, für Datenschutz und DSGVO-konforme Anonymisierung."
i18n_source_hash: 314e3e16a422
i18n_provenance: human
i18n_output_hash: b1283a5f8b45
---

# Gesichter & PII weichzeichnen {#face-pii-blur}

Erkennt und zeichnet Gesichter in Bildern automatisch mithilfe KI-gestützter Gesichtserkennung (MediaPipe) weich.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Verarbeitung:** Asynchron (gibt 202 zurück, `/api/v1/jobs/{jobId}/progress` per SSE nach dem Status abfragen)

**Modellpaket:** `face-detection` (200-300 MB)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (multipart) |
| blurRadius | number | Nein | `30` | Auf erkannte Gesichter angewendeter Weichzeichnungsradius (1-100) |
| sensitivity | number | Nein | `0.5` | Empfindlichkeit der Gesichtserkennung (0-1). Niedrigere Werte erkennen weniger Gesichter mit höherer Zuversicht |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
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
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Endergebnis (per SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### Keine Gesichter erkannt {#no-faces-detected}

Werden keine Gesichter gefunden, enthält das Ergebnis eine Warnung:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Hinweise {#notes}

- Erfordert die Installation des Modellpakets `face-detection` (200-300 MB).
- Das Ausgabeformat entspricht automatisch dem Eingabeformat.
- Das Array `faces` enthält die Koordinaten des Begrenzungsrahmens (x, y, width, height) für jedes erkannte Gesicht.
- Erhöhen Sie `sensitivity` (näher an 1.0), um mehr Gesichter zu erkennen, einschließlich teilweise verdeckter.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR über automatische Dekodierung.
