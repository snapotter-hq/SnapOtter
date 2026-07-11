---
description: "Inverti un file audio in modo che venga riprodotto al contrario."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 97edd86e80a0
---

# Inverti audio {#reverse-audio}

Inverti un file audio in modo che venga riprodotto al contrario.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Accetta dati di form multipart con un file audio e un campo JSON `settings`.

## Parametri {#parameters}

Questo strumento non ha parametri configurabili. L'intero file audio viene invertito.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Note {#notes}

- L'intera traccia audio viene invertita dalla fine all'inizio.
- L'output di solito mantiene il container di input. L'input AAC viene scritto come M4A, e gli input decodificabili solo in lettura non supportati ricadono su MP3.
