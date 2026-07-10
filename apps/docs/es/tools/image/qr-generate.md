---
description: "Genera códigos QR con colores personalizados y niveles de corrección de errores."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 869cddfea161
---

# Generador de códigos QR {#qr-code-generator}

Genera imágenes de códigos QR a partir de texto o URLs con tamaño, nivel de corrección de errores y colores de primer plano/fondo personalizables.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Acepta un **cuerpo JSON** (no multipart). No es necesario subir un archivo.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| text | string | Sí | - | Contenido que se codificará en el código QR (1 a 2000 caracteres) |
| size | number | No | `400` | Ancho/alto de la imagen de salida en píxeles (100 a 10000) |
| errorCorrection | string | No | `"M"` | Nivel de corrección de errores: `L` (7 %), `M` (15 %), `Q` (25 %), `H` (30 %) |
| foreground | string | No | `"#000000"` | Color del primer plano/módulo del código QR en hexadecimal (`#RRGGBB`) |
| background | string | No | `"#FFFFFF"` | Color de fondo del código QR en hexadecimal (`#RRGGBB`) |
| logoDataUri | string | No | - | Imagen del logo como URI de datos (`data:image/png;base64,...` o `data:image/jpeg;base64,...`, máximo 700 KB). Se centra en el código QR al 22 % de su tamaño. Fuerza la corrección de errores a `H` |

### Niveles de corrección de errores {#error-correction-levels}

| Nivel | Recuperación | Caso de uso |
|-------|----------|----------|
| `L` | ~7 % | Densidad de datos máxima |
| `M` | ~15 % | Equilibrado (predeterminado) |
| `Q` | ~25 % | Bueno para códigos impresos |
| `H` | ~30 % | El mejor para códigos con logos superpuestos |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

Código QR de marca con colores personalizados:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notas {#notes}

- Este endpoint acepta JSON, no datos de formulario multipart, ya que no es necesario subir ninguna imagen.
- La salida es siempre una imagen PNG.
- El nombre del archivo de salida es siempre `qrcode.png`.
- `originalSize` es siempre 0, ya que esta herramienta genera imágenes desde cero.
- Se incluye una zona de silencio (margen) de 2 módulos alrededor del código QR.
- La longitud máxima del texto es de 2000 caracteres. La capacidad real depende del nivel de corrección de errores y la codificación de caracteres.
- Los niveles de corrección de errores más altos permiten que el código QR siga siendo escaneable incluso si está parcialmente oculto, pero reducen la capacidad de datos.
- Cuando se proporciona un `logoDataUri`, la corrección de errores se fuerza automáticamente a `H` (30 %) para que el código QR siga siendo escaneable a pesar de que el logo ocluye el centro.
