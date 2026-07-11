---
description: "Convierte audio entre los formatos MP3, WAV, OGG, FLAC y M4A."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 762c2572e3e8
---

# Convertir audio {#convert-audio}

Convierte archivos de audio entre formatos comunes como MP3, WAV, OGG, FLAC y M4A, con tasa de bits de salida configurable.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Formato de salida: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | No | `192` | Tasa de bits de salida en kbps (32 a 320) |

## Solicitud de ejemplo {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Respuesta de ejemplo {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Notas {#notes}

- Los formatos de entrada admitidos incluyen MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF y OPUS.
- La tasa de bits solo se aplica a los formatos con pérdida (MP3, OGG, M4A). Los formatos sin pérdida como WAV y FLAC ignoran esta configuración.
- El nombre del archivo de salida conserva el nombre original con la nueva extensión.
