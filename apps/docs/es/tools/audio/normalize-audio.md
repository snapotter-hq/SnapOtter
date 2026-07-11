---
description: "Uniformiza el volumen a niveles estándar de radiodifusión (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: c1703a8b038f
---

# Normalizar audio {#normalize-audio}

Uniformiza el volumen del audio a niveles estándar de radiodifusión mediante la normalización EBU R128 (-16 LUFS).

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

Esta herramienta no tiene parámetros configurables. Aplica la normalización de volumen EBU R128 automáticamente.

## Solicitud de ejemplo {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- Usa el estándar de volumen EBU R128, con un objetivo de -16 LUFS.
- Ideal para podcasts, audiolibros y contenido de radiodifusión donde importa un volumen constante.
- La frecuencia de muestreo de origen se conserva en la salida.
- La salida suele conservar el contenedor de entrada. La entrada AAC se escribe como M4A, y las entradas de solo decodificación no compatibles recurren a MP3.
