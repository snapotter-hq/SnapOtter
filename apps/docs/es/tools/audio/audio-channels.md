---
description: "Convierte entre mono y estéreo o intercambia los canales izquierdo y derecho."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: dbd971db7fc5
---

# Canales de audio {#audio-channels}

Convierte el audio entre disposiciones mono y estéreo, o intercambia los canales izquierdo y derecho de un archivo estéreo.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| mode | string | Sí | - | Operación de canal: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Solicitud de ejemplo {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Respuesta de ejemplo {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Notas {#notes}

- `stereo-to-mono` mezcla ambos canales en una única pista mono.
- `mono-to-stereo` duplica el canal mono en el izquierdo y el derecho.
- `swap` intercambia los canales izquierdo y derecho de un archivo estéreo.
- La salida suele conservar el contenedor de entrada. La entrada AAC se escribe como M4A, y las entradas de solo decodificación no compatibles recurren a MP3.
