---
description: "Converti l'audio tra i formati MP3, WAV, OGG, FLAC e M4A."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 6e412e45cdc2
---

# Converti audio {#convert-audio}

Converti i file audio tra i formati comuni tra cui MP3, WAV, OGG, FLAC e M4A, con bitrate di output configurabile.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Accetta dati di form multipart con un file audio e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Formato di output: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | No | `192` | Bitrate di output in kbps (da 32 a 320) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Note {#notes}

- I formati di input supportati includono MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF e OPUS.
- Il bitrate si applica solo ai formati con perdita (MP3, OGG, M4A). I formati senza perdita come WAV e FLAC ignorano questa impostazione.
- Il nome del file di output mantiene il nome originale con la nuova estensione.
