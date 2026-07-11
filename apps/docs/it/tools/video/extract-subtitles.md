---
description: "Estrai la traccia dei sottotitoli da un video come file SRT."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 511a5cc064ce
---

# Extract Subtitles {#extract-subtitles}

Estrai la traccia di sottotitoli incorporata da un contenitore video e scaricala come file SRT.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Accetta dati form multipart con un file video. Questo strumento non ha impostazioni configurabili.

## Parameters {#parameters}

Questo strumento non ha parametri. Estrae la prima traccia di sottotitoli trovata nel contenitore video.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Il video deve contenere una traccia di sottotitoli incorporata. Se non viene trovata alcuna traccia di sottotitoli, la richiesta restituisce un errore 400.
- Se il video ha più tracce di sottotitoli, viene estratta la prima.
- Il formato di output è SRT indipendentemente dal formato originale dei sottotitoli nel contenitore.
