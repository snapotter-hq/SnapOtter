---
description: "Crea una suoneria da qualsiasi file audio."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 365695cb651c
---

# Creatore di suonerie {#ringtone-maker}

Crea una suoneria (.m4r) da qualsiasi file audio selezionando un tempo di inizio e una durata.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Accetta dati di form multipart con un file audio e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Tempo di inizio in secondi (minimo 0) |
| durationS | number | No | `30` | Durata della clip in secondi (da 1 a 30) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Note {#notes}

- L'output è sempre in formato M4R, compatibile con le suonerie iPhone.
- La durata massima della suoneria è di 30 secondi (limite Apple).
- È possibile usare qualsiasi formato audio come input.
