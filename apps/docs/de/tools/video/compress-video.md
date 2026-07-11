---
description: "Videodateigröße mit Qualitätssteuerung verringern."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: c8799ddd34d5
---

# Compress Video {#compress-video}

Videodateigröße mit konfigurierbarer Kompressionsstärke und optionaler Auflösungsreduzierung verringern.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen. Dies ist ein asynchroner Endpunkt: Er gibt sofort `202 Accepted` zurück, und der Fortschritt wird per SSE unter `GET /api/v1/jobs/{jobId}/progress` gestreamt.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Kompressionsstärke: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | Ausgabeauflösung: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Die Voreinstellung `light` bewahrt eine nahezu originalgetreue Qualität. Die Voreinstellung `strong` verringert die Dateigröße aggressiv auf Kosten der visuellen Wiedergabetreue.
- Die Auflösungsreduzierung (z. B. von 4K auf 720p) verstärkt sich zusammen mit der Kompression für eine deutliche Größenreduzierung.
- Fortschrittsaktualisierungen sind per SSE unter `GET /api/v1/jobs/{jobId}/progress` verfügbar, bis der Job abgeschlossen ist.
