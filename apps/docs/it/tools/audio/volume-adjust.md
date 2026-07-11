---
description: "Aumenta o riduce il volume dell'audio applicando un guadagno fisso in decibel."
i18n_source_hash: b9bc1de2c9ef
i18n_provenance: human
i18n_output_hash: 5872c4abd11c
---

# Volume Adjust {#volume-adjust}

Aumenta o riduce il volume di un file audio applicando un guadagno fisso in decibel.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Accetta dati form multipart con un file audio e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | Regolazione del volume in decibel (da -30 a 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- I valori positivi aumentano il volume; i valori negativi lo riducono.
- Guadagni positivi elevati possono causare clipping. Usa normalize-audio per un livellamento sicuro rispetto al volume.
- L'output di solito mantiene il container di input. L'input AAC viene scritto come M4A e gli input non supportati per la sola decodifica ricadono su MP3.
