---
description: "Converti l'audio tra i formati MP3, WAV, OGG, FLAC e M4A."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 6e412e45cdc2
---

# Converti audio {#convert-audio}

Converti i file audio tra i formati comuni tra cui MP3, WAV, OGG, FLAC e M4A, con bitrate di output e frequenza di campionamento configurabili.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Accetta dati di form multipart con un file audio e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Formato di output: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | No | `192` | Bitrate di output in kbps (da 32 a 320) |
| sampleRate | integer | No | frequenza originale | Frequenza di campionamento di output in Hz: `8000`, `16000`, `22050`, `32000`, `44100`, `48000` o `96000`. Ometti per mantenere la frequenza originale |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Note {#notes}

- I formati di input supportati includono MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF e OPUS.
- Il bitrate si applica solo ai formati con perdita (MP3, OGG, M4A). I formati senza perdita come WAV e FLAC ignorano questa impostazione.
- L'output MP3 supporta frequenze di campionamento fino a 48000 Hz. L'opzione 96000 Hz si applica solo a WAV, OGG, FLAC e M4A.
- Il bitrate MP3 è limitato dalla frequenza di campionamento: al massimo 64 kbps a 8000 Hz e 160 kbps a 16000 o 22050 Hz. Le richieste superiori al limite vengono rifiutate invece di essere ridotte silenziosamente.
- Il nome del file di output mantiene il nome originale con la nuova estensione.
