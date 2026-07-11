---
description: "Riduci il rumore di fondo dall'audio con denoising basato su FFT."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: fca867f7bf41
---

# Riduzione del rumore {#noise-reduction}

Riduci il rumore di fondo in un file audio usando il denoising basato su FFT con intensità selezionabile.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Accetta dati di form multipart con un file audio e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| strength | string | No | `"medium"` | Intensità del denoising: `light`, `medium`, `strong` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
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

- `light` preserva più dettagli ma rimuove meno rumore. `strong` rimuove più rumore ma può introdurre artefatti sottili.
- Risultati migliori su registrazioni con rumore di fondo costante (ronzio di ventole, aria condizionata, statica).
- L'output di solito mantiene il container di input. L'input AAC viene scritto come M4A, e gli input decodificabili solo in lettura non supportati ricadono su MP3.
