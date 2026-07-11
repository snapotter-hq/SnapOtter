---
description: "Combina più file audio in un'unica traccia sequenziale."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 08623df5e904
---

# Unisci audio {#merge-audio}

Combina due o più file audio in un'unica traccia sequenziale, concatenati nell'ordine in cui vengono caricati.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Accetta dati di form multipart con più file audio e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Formato di output: `mp3`, `wav`, `flac`, `m4a` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Note {#notes}

- Accetta da 2 a 10 file audio per richiesta.
- I file vengono concatenati nell'ordine di caricamento.
- Tutti i file di input vengono ricodificati nel formato di output e nella frequenza di campionamento scelti per una giunzione senza interruzioni.
- Sono supportati formati di input misti (ad es. un WAV e un MP3).
