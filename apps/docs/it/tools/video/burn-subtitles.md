---
description: "Renderizza in modo permanente i sottotitoli sui fotogrammi del video."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: dfa5f0766272
---

# Burn Subtitles {#burn-subtitles}

Renderizza in modo permanente (hard-code) i sottotitoli da un file SRT, VTT o ASS su ogni fotogramma di un video.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Accetta dati form multipart con un file video e un file di sottotitoli. Questo è un endpoint asincrono: restituisce `202 Accepted` immediatamente e l'avanzamento viene trasmesso tramite SSE su `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | Dimensione del carattere dei sottotitoli in pixel (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Carica due file: il primo deve essere un video, il secondo deve essere un file di sottotitoli (.srt, .vtt o .ass).
- I sottotitoli renderizzati sono parte permanente del video e non possono essere disattivati dallo spettatore. Per sottotitoli attivabili e disattivabili, usa invece lo strumento Embed Subtitles.
- Gli aggiornamenti sull'avanzamento sono disponibili tramite SSE su `GET /api/v1/jobs/{jobId}/progress` finché il job non è completato.
