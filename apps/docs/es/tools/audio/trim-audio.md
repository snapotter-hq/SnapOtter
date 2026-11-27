---
description: "Recorta una sección de un archivo de audio especificando los tiempos de inicio y fin."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: ad437b26de11
i18n_hash_version: 2
---

# Recortar audio {#trim-audio}

Recorta una sección de un archivo de audio. Puedes conservar la parte comprendida entre un tiempo de inicio y uno de fin, o cortar una cantidad fija al principio y al final.

En la aplicación, los campos de tiempo aceptan segundos simples (`90`), `MM:SS` (`1:30`) o `HH:MM:SS` (`1:02:03.5`). La API recibe segundos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Acepta datos de formulario multipart con un archivo de audio y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` conserva de `startS` a `endS`. `ends` elimina `cutStartS` del principio y `cutEndS` del final |
| startS | number | No | `0` | Modo de rango: tiempo de inicio en segundos (mínimo 0) |
| endS | number | Modo de rango | - | Modo de rango: tiempo de fin en segundos (debe ser posterior al inicio) |
| cutStartS | number | No | `0` | Modo de extremos: segundos que se eliminan del principio |
| cutEndS | number | No | `0` | Modo de extremos: segundos que se eliminan del final |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Cortar los primeros 2 segundos y los últimos 3, sea cual sea la duración del archivo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
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
- En el modo de rango, `endS` debe ser mayor que `startS`. Si `endS` supera la duración del audio, el archivo se recorta hasta el final.
- En el modo de extremos, al menos uno de `cutStartS` y `cutEndS` debe ser mayor que cero, y juntos deben dejar al menos 0,1 segundos de audio. Como el corte se mide a partir de la duración de cada archivo, un mismo ajuste sirve para un lote de archivos de distinta duración.
- La salida suele mantener el contenedor de entrada. La entrada AAC se escribe como M4A, y las entradas de solo decodificación no compatibles recurren a MP3.
