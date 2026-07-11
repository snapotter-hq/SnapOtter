---
description: "Aumenta o reduce el volumen del audio con una ganancia fija en decibelios."
i18n_source_hash: b9bc1de2c9ef
i18n_provenance: human
i18n_output_hash: e79985230aa5
---

# Ajustar volumen {#volume-adjust}

Aumenta o reduce el volumen de un archivo de audio aplicando una ganancia fija en decibelios.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | Ajuste de volumen en decibelios (-30 a 30) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notas {#notes}

- Los valores positivos aumentan el volumen; los negativos lo reducen.
- Las ganancias positivas grandes pueden causar recorte (clipping). Usa normalize-audio para una nivelación segura de la sonoridad.
- La salida suele mantener el contenedor de entrada. La entrada AAC se escribe como M4A, y las entradas de solo decodificación no compatibles recurren a MP3.
