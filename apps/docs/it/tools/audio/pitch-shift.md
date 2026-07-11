---
description: "Alza o abbassa l'intonazione dell'audio di semitoni senza cambiare la velocità."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: 98878f0a95d7
---

# Pitch Shift {#pitch-shift}

Alza o abbassa l'intonazione di un file audio di un certo numero di semitoni senza cambiarne la velocità di riproduzione.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

Accetta dati di form multipart con un file audio e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| semitones | integer | No | `3` | Semitoni di cui spostare (da -12 a 12). Deve essere diverso da zero. |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- I valori positivi alzano l'intonazione; i valori negativi la abbassano.
- Uno spostamento di 12 semitoni equivale a un'ottava in su; -12 equivale a un'ottava in giù.
- La durata di riproduzione rimane invariata indipendentemente dall'entità dello spostamento.
- L'output di solito mantiene il container di input. L'input AAC viene scritto come M4A, e gli input decodificabili solo in lettura non supportati ricadono su MP3.
