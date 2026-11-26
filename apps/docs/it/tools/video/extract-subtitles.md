---
description: "Estrai la traccia di sottotitoli da un video come file SRT, WebVTT o ASS."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 709e954e7a57
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Estrai la traccia di sottotitoli incorporata da un contenitore video e scaricala come file SRT, WebVTT o ASS.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Accetta dati form multipart con un file video e una stringa JSON `settings` facoltativa.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Formato di output: `srt`, `vtt` (WebVTT) o `ass` |

Viene estratta la prima traccia di sottotitoli trovata nel contenitore video.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Il video deve contenere una traccia di sottotitoli incorporata. Se non viene trovata alcuna traccia di sottotitoli, la richiesta restituisce un errore 400.
- Se il video ha più tracce di sottotitoli, viene estratta la prima.
- Le tracce di testo (SubRip, ASS, mov_text, WebVTT) si convertono in uno qualsiasi dei tre formati di output. Convertire una traccia ASS in SRT o WebVTT ne elimina il posizionamento e gli effetti.
- Le tracce basate su immagini (Blu-ray PGS, DVD VobSub) non possono essere trasformate in testo senza OCR e restituiscono un errore 422.
