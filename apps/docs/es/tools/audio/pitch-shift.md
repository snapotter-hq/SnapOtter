---
description: "Sube o baja el tono del audio en semitonos sin cambiar la velocidad."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: 927685c707fa
---

# Cambio de tono {#pitch-shift}

Sube o baja el tono de un archivo de audio en una cantidad de semitonos sin cambiar su velocidad de reproducción.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| semitones | integer | No | `3` | Semitonos a desplazar (-12 a 12). Debe ser distinto de cero. |

## Solicitud de ejemplo {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- Los valores positivos suben el tono; los negativos lo bajan.
- Un desplazamiento de 12 semitonos equivale a una octava hacia arriba; -12 equivale a una octava hacia abajo.
- La duración de reproducción se mantiene igual independientemente del desplazamiento.
- La salida suele conservar el contenedor de entrada. La entrada AAC se escribe como M4A, y las entradas de solo decodificación no compatibles recurren a MP3.
