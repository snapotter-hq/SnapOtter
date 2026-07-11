---
description: "Effettua il mux di una traccia di sottotitoli nel contenitore video."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 007bfde593fa
---

# Embed Subtitles {#embed-subtitles}

Effettua il mux di un file di sottotitoli nel contenitore video come traccia di sottotitoli soft che gli spettatori possono attivare o disattivare.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Accetta dati form multipart con un file video e un file di sottotitoli, più un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | Codice lingua ISO 639-2/B (3 lettere minuscole, ad es. `"eng"`, `"fra"`, `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- Carica due file: il primo deve essere un video, il secondo deve essere un file di sottotitoli (.srt, .vtt o .ass).
- I sottotitoli incorporati (soft) possono essere attivati e disattivati dallo spettatore nel proprio lettore multimediale. Per sottotitoli sempre visibili, usa invece lo strumento Burn Subtitles.
- Il codice lingua viene memorizzato come metadato nel contenitore e aiuta i lettori multimediali a etichettare la traccia dei sottotitoli.
