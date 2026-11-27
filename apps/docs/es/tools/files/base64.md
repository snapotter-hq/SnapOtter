---
description: "Codifica texto en Base64 o decodifica Base64 a texto."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: f7a051f87369
i18n_hash_version: 2
---

# Codificar / decodificar Base64 {#base64}

Pega texto para obtener Base64, o pega Base64 para recuperar el texto, y luego copia el resultado. El texto va a tu propio servidor de SnapOtter y a ningún otro sitio.

Para convertir una imagen a Base64, usa en su lugar [Image to Base64](/es/tools/image/image-to-base64).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

Acepta un cuerpo JSON, no datos de formulario multipart, y responde con el texto convertido en lugar de un archivo para descargar.

## Parámetros {#parameters}

| Nombre | Tipo | Predeterminado | Descripción |
|------|------|---------|-------------|
| `text` | string | (obligatorio) | Texto que codificar, o Base64 que decodificar. Hasta 1.000.000 de caracteres. |
| `mode` | string | (obligatorio) | `encode` o `decode`. |
| `urlSafe` | boolean | `false` | Al codificar, usa el alfabeto seguro para URL (`-` y `_`) y omite el relleno `=`. Se ignora al decodificar. |

## Ejemplo de solicitud {#example-request}

Codificar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Decodificar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notas {#notes}

- El texto se codifica como UTF-8, así que las letras con acento, el CJK y los emoji se conservan en el viaje de ida y vuelta.
- La decodificación ignora los espacios y los saltos de línea, de modo que el Base64 dividido a 76 columnas (correo, cuerpos PEM) se decodifica tal como se pegó.
- La decodificación acepta entradas con o sin relleno `=`, ya sea en el alfabeto estándar (`+`, `/`) o en el seguro para URL (`-`, `_`), pero no una mezcla de ambos.
- Una entrada que no es Base64 falla con un 400 y el código `ENCODED_TEXT_INVALID`. Un Base64 válido que se decodifica a datos binarios (una imagen, un ZIP) en lugar de texto UTF-8 falla con `DECODED_DATA_NOT_TEXT`.
