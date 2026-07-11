---
description: "Uniforma il volume ai livelli dello standard di trasmissione (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: 9c3207d1da74
---

# Normalizza audio {#normalize-audio}

Uniforma il volume dell'audio ai livelli dello standard di trasmissione usando la normalizzazione EBU R128 (-16 LUFS).

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Accetta dati di form multipart con un file audio e un campo JSON `settings`.

## Parametri {#parameters}

Questo strumento non ha parametri configurabili. Applica automaticamente la normalizzazione del volume EBU R128.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- Usa lo standard di volume EBU R128, con target -16 LUFS.
- Ideale per podcast, audiolibri e contenuti di trasmissione dove è importante un volume costante.
- La frequenza di campionamento sorgente viene preservata nell'output.
- L'output di solito mantiene il container di input. L'input AAC viene scritto come M4A, e gli input decodificabili solo in lettura non supportati ricadono su MP3.
