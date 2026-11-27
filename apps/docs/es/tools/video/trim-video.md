---
description: "Extrae un clip de un vídeo especificando los tiempos de inicio y fin."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: a30c650071a1
i18n_hash_version: 2
---

# Trim Video {#trim-video}

Extrae un clip de un vídeo. Puedes conservar la parte entre un tiempo de inicio y uno de fin, o recortar una cantidad fija al principio y al final. Hay una opción para cortes exactos por fotograma.

En la aplicación, los campos de tiempo aceptan segundos simples (`90`), `MM:SS` (`1:30`) o `HH:MM:SS` (`1:02:03.5`). La API acepta segundos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Acepta datos de formulario multipart con un archivo de vídeo y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` conserva de `startS` a `endS`. `ends` elimina `cutStartS` del principio y `cutEndS` del final |
| startS | number | No | `0` | Range mode: tiempo de inicio en segundos (debe ser >= 0) |
| endS | number | Range mode | - | Range mode: tiempo de fin en segundos (debe ser posterior a startS) |
| cutStartS | number | No | `0` | Ends mode: segundos que se eliminan del principio |
| cutEndS | number | No | `0` | Ends mode: segundos que se eliminan del final |
| precise | boolean | No | `false` | Recodifica todo el rango para que los fotogramas de inicio y fin sean exactos, en lugar de copiar desde el siguiente fotograma clave |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Recorta los primeros 5 segundos y los últimos 10 segundos, sea cual sea la duración del vídeo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Cuando `precise` es `false` (el valor predeterminado), el clip empieza en el fotograma exacto que pediste. Solo se recodifican los fotogramas entre ese inicio y el siguiente fotograma clave, y el resto se copia, por lo que sigue siendo rápido. El final puede alargarse un fotograma o poco más, porque un flujo copiado conserva los fotogramas de los que dependen los anteriores. Las fuentes que no se pueden empalmar con seguridad de esta forma (H.264 de 10 bits o entrelazado, otros códecs que necesitan un inicio recodificado, o archivos AVI, FLV, MPEG y TS) se recodifican por completo.
- Establecer `precise` en `true` recodifica siempre todo el rango, de modo que ambos extremos son exactos, pero tarda más.
- En range mode, `endS` debe ser mayor que `startS`. Si `endS` queda más allá del final del vídeo, el clip llega hasta el final.
- En ends mode, al menos uno de `cutStartS` y `cutEndS` debe ser mayor que cero, y entre los dos deben dejar parte del vídeo. Como el corte se mide a partir de la duración de cada archivo, un solo ajuste sirve para un lote de vídeos con duraciones distintas.
