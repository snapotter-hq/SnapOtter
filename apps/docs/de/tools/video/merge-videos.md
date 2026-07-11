---
description: "Mehrere Videoclips zu einer Datei zusammenfügen."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 342f5ae0ad32
---

# Merge Videos {#merge-videos}

Mehrere Videoclips zu einer einzigen MP4-Datei zusammenfügen. Alle Eingaben werden auf die Auflösung des ersten Videos und 30 fps normalisiert.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Nimmt Multipart-Formulardaten mit zwei oder mehr Videodateien entgegen. Dies ist ein asynchroner Endpunkt: Er gibt sofort `202 Accepted` zurück, und der Fortschritt wird per SSE unter `GET /api/v1/jobs/{jobId}/progress` gestreamt.

## Parameters {#parameters}

Dieses Tool hat keine Einstellungsparameter. Laden Sie 2-10 Videodateien als mehrere `file`-Teile hoch.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Die Clips werden in der Reihenfolge aneinandergereiht, in der sie hochgeladen werden.
- Alle Clips werden neu kodiert, um die Auflösung, Bildrate (30 fps) und den Codec (H.264) des ersten Clips anzupassen. Nicht übereinstimmende Eingaben werden automatisch normalisiert.
- Akzeptiert 2-10 Videodateien pro Anfrage.
- Fortschrittsaktualisierungen sind per SSE unter `GET /api/v1/jobs/{jobId}/progress` verfügbar, bis der Job abgeschlossen ist.
