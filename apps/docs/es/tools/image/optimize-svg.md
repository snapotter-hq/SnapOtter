---
description: "Minimiza archivos SVG con svgo y conserva el resultado como SVG vectorial, con control de precisión, pasadas múltiples, metadatos y formato."
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: d70509454f3b
i18n_hash_version: 2
---

# Optimizar SVG {#optimize-svg}

Reduce el tamaño de los archivos SVG eliminando restos del editor, atributos redundantes y decimales sobrantes, y descarga el resultado como SVG. A diferencia de «Optimizar para web», la salida nunca se rasteriza.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Acepta datos de formulario multipart con un archivo `.svg` o `.svgz` y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| precision | number | No | `3` | Decimales que se conservan en los datos de trazado y los números (0 a 8). Los valores más bajos dan archivos más pequeños y curvas algo menos finas. |
| multipass | boolean | No | `true` | Ejecutar el optimizador repetidamente hasta que la salida deje de reducirse |
| removeMetadata | boolean | No | `true` | Eliminar comentarios, `<metadata>`, `<desc>` y datos propios de los editores. Desactívalo para conservarlos. |
| pretty | boolean | No | `false` | Sangrar la salida para que sea legible en lugar de minimizarla en pocas líneas |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Notas {#notes}

- La entrada debe ser un archivo SVG o SVGZ. Una imagen rasterizada se rechaza con `400` y el código `IMAGE_UNDECODABLE`.
- La entrada `.svgz` se descomprime primero, y la salida siempre es un `.svg` sin comprimir.
- El SVG está limitado a 10 MB tras descomprimirlo. Un archivo mayor se rechaza con `400` y el código `SVG_TOO_LARGE`.
- `viewBox` y `<title>` siempre se conservan, así que el gráfico sigue escalando y mantiene su nombre accesible.
- La entrada y la salida pasan por el sanitizador de SVG, que elimina scripts y otro contenido activo.
- Bajar `precision` es el mayor ahorro de tamaño en ilustraciones con muchos trazados. Comprueba el resultado visualmente entre 0 y 2.
