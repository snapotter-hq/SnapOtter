---
description: "Trasforma un insieme di immagini in un video con presentazione."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: 6a2031b4bf46
---

# Images to Video {#images-to-video}

Trasforma un insieme di immagini in un video con presentazione, con durata per immagine, risoluzione e frequenza dei fotogrammi configurabili.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Accetta dati form multipart con due o più file di immagine e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | Durata di visualizzazione per immagine in secondi (0.5-10) |
| resolution | string | No | `"720p"` | Risoluzione di output: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Frequenza dei fotogrammi di output (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Accetta 2-60 file di immagine per richiesta. Le immagini appaiono nel video nell'ordine di caricamento.
- Le immagini vengono ridimensionate e riempite con bordi per adattarsi alla risoluzione target preservando le proporzioni.
- L'opzione di risoluzione `square` produce un video 1080x1080, utile per i social media.
- Il formato di output è sempre MP4 (H.264).
