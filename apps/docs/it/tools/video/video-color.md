---
description: "Regola luminosità, contrasto, saturazione e gamma di un video."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 02afad4e2a46
---

# Video Color {#video-color}

Regola luminosità, contrasto, saturazione e correzione della gamma su un video.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Regolazione della luminosità (da -1 a 1) |
| contrast | number | No | `1` | Moltiplicatore del contrasto (0-4) |
| saturation | number | No | `1` | Moltiplicatore della saturazione (0-3). Imposta a 0 per la scala di grigi |
| gamma | number | No | `1` | Correzione della gamma (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Tutti i valori ai loro predefiniti (luminosità 0, contrasto 1, saturazione 1, gamma 1) non producono alcuna modifica.
- Impostare la saturazione a `0` converte il video in scala di grigi.
- Valori di gamma inferiori a 1 schiariscono le ombre, mentre valori superiori a 1 le scuriscono.
