---
description: "Invierte un archivo de audio para que se reproduzca al revés."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 7d981bdfc304
---

# Invertir audio {#reverse-audio}

Invierte un archivo de audio para que se reproduzca al revés.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

Esta herramienta no tiene parámetros configurables. Se invierte el archivo de audio completo.

## Solicitud de ejemplo {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- La pista de audio completa se invierte de fin a principio.
- La salida suele conservar el contenedor de entrada. La entrada AAC se escribe como M4A, y las entradas de solo decodificación no compatibles recurren a MP3.
