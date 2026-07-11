---
description: "Aggiungi effetti di dissolvenza in entrata e in uscita all'audio."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: a91f9d495071
---

# Dissolvenza audio {#fade-audio}

Aggiungi effetti di dissolvenza in entrata e in uscita all'inizio e alla fine di un file audio.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Accetta dati di form multipart con un file audio e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| fadeInS | number | No | `1` | Durata della dissolvenza in entrata in secondi (da 0 a 30) |
| fadeOutS | number | No | `1` | Durata della dissolvenza in uscita in secondi (da 0 a 30) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
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

- Imposta uno dei due valori a `0` per saltare quella direzione della dissolvenza. Almeno uno deve essere maggiore di 0.
- La durata della dissolvenza viene limitata alla lunghezza dell'audio se la supera.
- L'output di solito mantiene il container di input. L'input AAC viene scritto come M4A, e gli input decodificabili solo in lettura non supportati ricadono su MP3.
