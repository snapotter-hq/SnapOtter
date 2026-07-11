---
description: "Ritaglia una sezione da un file audio specificando l'ora di inizio e di fine."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: eff2ff178e03
---

# Trim Audio {#trim-audio}

Ritaglia una sezione da un file audio specificando l'ora di inizio e di fine in secondi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Accetta dati form multipart con un file audio e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Ora di inizio in secondi (minimo 0) |
| endS | number | Yes | - | Ora di fine in secondi (deve essere dopo l'inizio) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Gli orari sono specificati in secondi e possono includere decimali (ad esempio `10.5`).
- Il valore `endS` deve essere maggiore di `startS`.
- Se `endS` supera la durata dell'audio, il file viene ritagliato fino alla fine.
- L'output di solito mantiene il container di input. L'input AAC viene scritto come M4A e gli input non supportati per la sola decodifica ricadono su MP3.
