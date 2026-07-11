---
description: "Reduce el ruido de fondo del audio con eliminación de ruido basada en FFT."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 50c5eafed157
---

# Reducción de ruido {#noise-reduction}

Reduce el ruido de fondo de un archivo de audio mediante eliminación de ruido basada en FFT con intensidad seleccionable.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| strength | string | No | `"medium"` | Intensidad de eliminación de ruido: `light`, `medium`, `strong` |

## Solicitud de ejemplo {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
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

- `light` conserva más detalle pero elimina menos ruido. `strong` elimina más ruido pero puede introducir artefactos sutiles.
- Mejores resultados en grabaciones con ruido de fondo constante (zumbido de ventilador, aire acondicionado, estática).
- La salida suele conservar el contenedor de entrada. La entrada AAC se escribe como M4A, y las entradas de solo decodificación no compatibles recurren a MP3.
