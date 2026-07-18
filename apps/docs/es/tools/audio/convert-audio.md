---
description: "Convierte audio entre los formatos MP3, WAV, OGG, FLAC y M4A."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 762c2572e3e8
---

# Convertir audio {#convert-audio}

Convierte archivos de audio entre formatos comunes como MP3, WAV, OGG, FLAC y M4A, con tasa de bits y frecuencia de muestreo de salida configurables.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Formato de salida: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | No | `192` | Tasa de bits de salida en kbps (32 a 320) |
| sampleRate | integer | No | frecuencia de origen | Frecuencia de muestreo de salida en Hz: `8000`, `16000`, `22050`, `32000`, `44100`, `48000` o `96000`. Omítelo para conservar la frecuencia de origen |

## Solicitud de ejemplo {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Respuesta de ejemplo {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Notas {#notes}

- Los formatos de entrada admitidos incluyen MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF y OPUS.
- La tasa de bits solo se aplica a los formatos con pérdida (MP3, OGG, M4A). Los formatos sin pérdida como WAV y FLAC ignoran esta configuración.
- La salida MP3 admite frecuencias de muestreo de hasta 48000 Hz. La opción de 96000 Hz solo se aplica a WAV, OGG, FLAC y M4A.
- La tasa de bits de MP3 está limitada por la frecuencia de muestreo: como máximo 64 kbps a 8000 Hz y 160 kbps a 16000 o 22050 Hz. Las solicitudes por encima del límite se rechazan en lugar de reducirse silenciosamente.
- El nombre del archivo de salida conserva el nombre original con la nueva extensión.
