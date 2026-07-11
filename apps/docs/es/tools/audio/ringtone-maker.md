---
description: "Crea un clip de tono de llamada a partir de cualquier archivo de audio."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: a41b65bae5a2
---

# Creador de tonos de llamada {#ringtone-maker}

Crea un clip de tono de llamada (.m4r) a partir de cualquier archivo de audio seleccionando una hora de inicio y una duración.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Hora de inicio en segundos (mínimo 0) |
| durationS | number | No | `30` | Duración del clip en segundos (1 a 30) |

## Solicitud de ejemplo {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Respuesta de ejemplo {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Notas {#notes}

- La salida siempre está en formato M4R, compatible con los tonos de llamada del iPhone.
- La duración máxima del tono de llamada es de 30 segundos (límite de Apple).
- Se puede usar cualquier formato de audio como entrada.
