---
description: "Videos zwischen MP4, MOV, WebM, AVI und MKV konvertieren."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: f2ccd8ab325a
---

# Convert Video {#convert-video}

Videos zwischen den Formaten MP4, MOV, WebM, AVI und MKV mit konfigurierbaren Qualitätsvoreinstellungen konvertieren.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen. Dies ist ein asynchroner Endpunkt: Er gibt sofort `202 Accepted` zurück, und der Fortschritt wird per SSE unter `GET /api/v1/jobs/{jobId}/progress` gestreamt.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Ausgabeformat: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | Qualitätsvoreinstellung: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Die Qualitätsvoreinstellung `high` erzeugt die beste visuelle Wiedergabetreue, aber größere Dateien. Die Voreinstellung `small` komprimiert aggressiv für minimale Dateigröße.
- WebM-Ausgabe verwendet VP9-Kodierung. MP4 und MOV verwenden H.264. AVI und MKV sind für Legacy- oder Archivierungs-Workflows verfügbar.
- Fortschrittsaktualisierungen sind per SSE unter `GET /api/v1/jobs/{jobId}/progress` verfügbar, bis der Job abgeschlossen ist.
