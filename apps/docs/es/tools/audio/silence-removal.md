---
description: "Elimina las secciones silenciosas de un archivo de audio."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 41d9bfafe31a
---

# Eliminación de silencios {#silence-removal}

Detecta y elimina las secciones silenciosas de un archivo de audio según un umbral y una duración mínima configurables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | Umbral de silencio en dB (-80 a -20). El audio por debajo de este nivel se considera silencio. |
| minSilenceS | number | No | `0.5` | Duración mínima del silencio en segundos que se debe eliminar (0.1 a 5) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notas {#notes}

- Un umbral más alto (menos negativo) es más agresivo y elimina también los pasajes más silenciosos, además del silencio real.
- Aumenta `minSilenceS` para eliminar solo las pausas más largas y conservar las breves pausas naturales.
- Útil para limpiar grabaciones de podcasts, conferencias y notas de voz.
- La salida suele mantener el contenedor de entrada. La entrada AAC se escribe como M4A, y las entradas de solo decodificación no compatibles recurren a MP3.
