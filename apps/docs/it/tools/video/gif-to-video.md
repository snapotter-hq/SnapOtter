---
description: "Converti una GIF animata in un video MP4, WebM o MOV."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 5880b1f2e3b9
---

# GIF to Video {#gif-to-video}

Converti una GIF animata in un file video compatto MP4, WebM o MOV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Accetta dati form multipart con un file GIF e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Formato di output: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- Convertire una GIF in video riduce tipicamente la dimensione del file dell'80-90% mantenendo la stessa qualità visiva.
- Sono accettati solo file GIF animati. Le immagini statiche dovrebbero usare lo strumento Convert delle immagini.
- MP4 e MOV usano la codifica H.264, WebM usa VP9.
