---
description: "Trasforma un insieme di immagini in un video con presentazione, una GIF animata o una WebP animata."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: d2bf0cd2fdf6
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Trasforma un insieme di immagini in un video con presentazione, con durata per immagine, risoluzione e frequenza dei fotogrammi configurabili, oppure in una GIF o WebP animata con un tempo fisso per fotogramma e un numero di cicli.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Accetta dati form multipart con due o più file di immagine e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | Formato di output: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | Solo MP4. Durata di visualizzazione per immagine in secondi (0.5-10) |
| resolution | string | No | `"720p"` | Solo MP4. Risoluzione di output: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Solo MP4. Frequenza dei fotogrammi di output (10-60) |
| frameDelayMs | integer | No | `500` | Solo GIF e WebP. Tempo di visualizzazione di ogni immagine, in millisecondi (20-10000) |
| loop | integer | No | `0` | Solo GIF e WebP. Quante volte viene riprodotta l'animazione; `0` la ripete all'infinito (0-100) |

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

Per creare una GIF animata che mostra ogni immagine per 200 ms:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
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
- Per MP4, le immagini vengono ridimensionate e riempite con bordi per adattarsi alla risoluzione target preservando le proporzioni.
- L'opzione di risoluzione `square` produce un video 1080x1080, utile per i social media.
- L'output MP4 è H.264, con nome `slideshow.mp4`.
- L'output GIF e WebP usa le dimensioni della prima immagine. Le immagini di altre dimensioni vengono scalate per rientrarvi e l'area rimanente è trasparente. Il file si chiama `slideshow.gif` o `slideshow.webp`.
- La GIF memorizza i tempi dei fotogrammi in centesimi di secondo, quindi `frameDelayMs` viene arrotondato ai 10 ms più vicini in una GIF. La WebP mantiene il valore esatto.
- Le animazioni di grandi dimensioni vengono rifiutate anziché create: la dimensione del fotogramma moltiplicata per il numero di immagini deve restare sotto lo stesso limite di pixel usato dagli strumenti GIF.
