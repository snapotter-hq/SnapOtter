---
description: "Converti tra mono e stereo o scambia i canali sinistro e destro."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: e075bdec462d
---

# Canali audio {#audio-channels}

Converti l'audio tra layout mono e stereo, oppure scambia i canali sinistro e destro di un file stereo.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Accetta dati di form multipart con un file audio e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| mode | string | Sì | - | Operazione sui canali: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Note {#notes}

- `stereo-to-mono` mixa entrambi i canali in un'unica traccia mono.
- `mono-to-stereo` duplica il canale mono su sinistro e destro.
- `swap` scambia i canali sinistro e destro di un file stereo.
- L'output di solito mantiene il container di input. L'input AAC viene scritto come M4A, e gli input decodificabili solo in lettura non supportati ricadono su MP3.
