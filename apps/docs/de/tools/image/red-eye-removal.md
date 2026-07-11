---
description: "KI-gestützte Erkennung und Korrektur von roten Augen durch Kamerablitz."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: 42014e0da50b
---

# Rote-Augen-Entfernung {#red-eye-removal}

KI-gestützte Erkennung und Korrektur von roten Augen durch Kamerablitz.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Verarbeitung:** Asynchron (gibt 202 zurück, Status über SSE per `/api/v1/jobs/{jobId}/progress` abfragen)

**Modell-Bundle:** `face-detection` (200-300 MB)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (multipart) |
| sensitivity | number | Nein | `50` | Empfindlichkeit der Rote-Augen-Erkennung (0-100). Höhere Werte erkennen subtileres Rot |
| strength | number | Nein | `70` | Korrekturstärke (0-100). Wie aggressiv das Rot neutralisiert wird |
| format | string | Nein | - | Ausgabeformat (optionale Überschreibung) |
| quality | number | Nein | `90` | Ausgabequalität (1-100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Endergebnis (über SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Hinweise {#notes}

- Erfordert das installierte Modell-Bundle `face-detection` (200-300 MB).
- Erkennt zunächst Gesichter, lokalisiert dann die Augenbereiche innerhalb jedes Gesichts und identifiziert und korrigiert schließlich die Rote-Augen-Pixel.
- Die Anzahl `facesDetected` gibt an, wie viele Gesichter gefunden wurden; `eyesCorrected` ist die Gesamtzahl der einzelnen Augen, bei denen die roten Augen korrigiert wurden.
- Die Ausgabe ist zur maximalen Qualitätserhaltung immer PNG.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR durch automatische Dekodierung.
