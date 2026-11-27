---
description: "Calcula el ancho o el alto que falta para mantener una relación de aspecto y simplifica la relación."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: f2051f203e46
i18n_hash_version: 2
---

# Calculadora de relación de aspecto {#aspect-ratio-calculator}

Introduce un ancho y un alto originales, y después un ancho nuevo o un alto nuevo, y obtendrás el otro lado para que las proporciones se mantengan. La relación se devuelve en su forma más simple, así que 1920 × 1080 es 16:9. En la aplicación web puedes partir de una relación habitual (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) y alternar entre horizontal y vertical.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Acepta un cuerpo JSON, no datos de formulario multipart, y responde con números en lugar de un archivo para descargar.

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `width` | number | (obligatorio) | Ancho original. |
| `height` | number | (obligatorio) | Alto original. |
| `newWidth` | number | - | Ancho de destino. La respuesta calcula `newHeight` a partir de él. |
| `newHeight` | number | - | Alto de destino. La respuesta calcula `newWidth` a partir de él. |
| `round` | boolean | `true` | Redondea el lado calculado a un número entero. Cuando es `false`, conserva dos decimales. |

Cada dimensión debe estar entre `0.0001` y `1000000`. Envía `newWidth` o `newHeight`, no ambos. Omite los dos para obtener solo la relación simplificada.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Example Response {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

`newWidth` y `newHeight` son `null` cuando la solicitud no envió ninguno de los dos.

## Notes {#notes}

- Los tamaños fraccionarios se reducen a una relación de números enteros usando hasta cuatro decimales, por lo que `8.5` × `11` se devuelve como `17:22`.
- `ratioDecimal` es el ancho dividido entre el alto, redondeado a cuatro decimales.
- Un lado calculado nunca se devuelve como `0`. Con el redondeo activado vale al menos `1`, y con el redondeo desactivado vale al menos `0.01`.
- Enviar `newWidth` y `newHeight` a la vez, o una dimensión fuera del rango permitido, devuelve un 400.
- La calculadora nunca lee ni escribe un archivo. Para aplicar los números, usa [Redimensionar imagen](/es/tools/image/resize) o [Recortar imagen](/es/tools/image/crop).
