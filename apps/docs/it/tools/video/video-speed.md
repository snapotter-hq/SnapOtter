---
description: "Accelera o rallenta un video."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: d111a6af4ecd
---

# Video Speed {#video-speed}

Accelera o rallenta un video con un'opzione per preservare l'intonazione dell'audio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | Moltiplicatore della velocità (0.25-4). Valori superiori a 1 accelerano, inferiori a 1 rallentano |
| keepPitch | boolean | No | `true` | Preserva l'intonazione dell'audio quando cambia la velocità |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- Un fattore di `2` raddoppia la velocità di riproduzione (dimezza la durata). Un fattore di `0.5` dimezza la velocità di riproduzione (raddoppia la durata).
- Quando `keepPitch` è `true`, l'audio viene dilatato nel tempo in modo che le voci suonino naturali. Quando è `false`, l'intonazione cambia in modo proporzionale alla velocità.
- L'intervallo valido è da 0.25x a 4x.
