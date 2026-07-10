---
description: "Recorta una sección de un archivo de audio especificando los tiempos de inicio y fin."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 576433461bd2
---

# Recortar audio {#trim-audio}

Recorta una sección de un archivo de audio especificando los tiempos de inicio y fin en segundos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Tiempo de inicio en segundos (mínimo 0) |
| endS | number | Sí | - | Tiempo de fin en segundos (debe ser posterior al inicio) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notas {#notes}

- Los tiempos se especifican en segundos y pueden incluir decimales (p. ej. `10.5`).
- El valor `endS` debe ser mayor que `startS`.
- Si `endS` supera la duración del audio, el archivo se recorta hasta el final.
- La salida suele mantener el contenedor de entrada. La entrada AAC se escribe como M4A, y las entradas de solo decodificación no compatibles recurren a MP3.
