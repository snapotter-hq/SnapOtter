---
description: "Acelera o ralentiza la reproducción de audio con un multiplicador."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: baa6db77e49d
---

# Velocidad de audio {#audio-speed}

Acelera o ralentiza la reproducción de audio aplicando un multiplicador de velocidad.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| factor | number | No | `1.5` | Multiplicador de velocidad (0.25 a 4). Los valores por debajo de 1 ralentizan; por encima de 1 aceleran. |

## Solicitud de ejemplo {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Respuesta de ejemplo {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Notas {#notes}

- Un factor de `0.25` reproduce a un cuarto de velocidad (4 veces más largo). Un factor de `4` reproduce al cuádruple de velocidad (4 veces más corto).
- El tono se conserva mientras cambia la velocidad (estiramiento temporal). Usa el cambio de tono para ajustar el tono de forma independiente.
- La salida suele conservar el contenedor de entrada. La entrada AAC se escribe como M4A, y las entradas de solo decodificación no compatibles recurren a MP3.
