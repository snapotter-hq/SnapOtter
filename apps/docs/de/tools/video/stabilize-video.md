---
description: "Verwacklungen mit Zwei-Pass-Stabilisierung reduzieren."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: f27b80786d66
---

# Stabilize Video {#stabilize-video}

Verwacklungen in Handheld-Aufnahmen mit der Zwei-Pass-vidstab-Stabilisierung von FFmpeg reduzieren.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen. Dies ist ein asynchroner Endpunkt: Er gibt sofort `202 Accepted` zurück, und der Fortschritt wird per SSE unter `GET /api/v1/jobs/{jobId}/progress` gestreamt.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | Größe des Glättungsfensters in Frames (5-60). Höhere Werte erzeugen eine gleichmäßigere Bewegung |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Die Stabilisierung ist ein Zwei-Pass-Prozess: Der erste Durchlauf analysiert die Kamerabewegung, und der zweite Durchlauf wendet die Korrektur an. Dies dauert etwa doppelt so lange wie bei Single-Pass-Tools.
- Höhere Glättungswerte entfernen mehr Verwacklungen, können aber an den Rändern einen leichten Zoom-Zuschnitt einführen.
- Fortschrittsaktualisierungen sind per SSE unter `GET /api/v1/jobs/{jobId}/progress` verfügbar, bis der Job abgeschlossen ist.
