---
description: "Ritaglia una clip da un video specificando gli orari di inizio e fine."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: f675c12793ae
---

# Trim Video {#trim-video}

Ritaglia una clip da un video specificando gli orari di inizio e fine in secondi, con un'opzione per tagli precisi al fotogramma.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Orario di inizio in secondi (deve essere >= 0) |
| endS | number | Yes | - | Orario di fine in secondi (deve essere successivo a startS) |
| precise | boolean | No | `false` | Ricodifica per tagli precisi al fotogramma invece del seek per keyframe |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Quando `precise` è `false` (il valore predefinito), lo strumento usa il seek per keyframe, che è veloce ma può iniziare qualche fotogramma prima dell'orario richiesto.
- Impostare `precise` su `true` ricodifica il segmento per confini esatti dei fotogrammi, ma richiede più tempo.
- Il valore `endS` deve essere maggiore di `startS`.
