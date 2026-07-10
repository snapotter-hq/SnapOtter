---
description: "Añade efectos de fundido de entrada y de salida al audio."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: b388d2677de3
---

# Fundido de audio {#fade-audio}

Añade efectos de fundido de entrada y de salida al principio y al final de un archivo de audio.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| fadeInS | number | No | `1` | Duración del fundido de entrada en segundos (0 a 30) |
| fadeOutS | number | No | `1` | Duración del fundido de salida en segundos (0 a 30) |

## Solicitud de ejemplo {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
```

## Respuesta de ejemplo {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notas {#notes}

- Establece cualquiera de los valores en `0` para omitir ese sentido del fundido. Al menos uno debe ser mayor que 0.
- La duración del fundido se limita a la longitud del audio si la supera.
- La salida suele conservar el contenedor de entrada. La entrada AAC se escribe como M4A, y las entradas de solo decodificación no compatibles recurren a MP3.
