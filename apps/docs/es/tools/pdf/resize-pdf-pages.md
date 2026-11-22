---
description: "Cambia el tamaño de cada página de un PDF a A4, Carta, una etiqueta de envío de 4x6 in o un tamaño personalizado."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 06bc587ddfcd
i18n_hash_version: 2
---

# Cambiar el tamaño de las páginas de un PDF {#resize-pdf-pages}

Cambia el tamaño de página de todas las páginas de un PDF. El contenido se escala para ajustarse a la nueva página y se centra, así que el texto, el arte vectorial y los códigos de barras siguen nítidos. Úsalo para convertir una etiqueta de envío en una página de 4x6 in para una impresora térmica, o para pasar un documento de A4 a US Letter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | Tamaño de destino: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal` o `custom` |
| width | number | No | `4` | Ancho de página personalizado, usado cuando `pageSize` es `custom` |
| height | number | No | `6` | Alto de página personalizado, usado cuando `pageSize` es `custom` |
| unit | string | No | `"in"` | Unidad del tamaño personalizado: `in` o `mm` |
| keepOrientation | boolean | No | `false` | Gira el tamaño de destino para ajustarlo a la orientación de cada página en lugar de forzar ancho por alto |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notas {#notes}

- Las páginas se escalan para ajustarse, nunca se deforman. Cuando la relación de aspecto es distinta, el espacio sobrante se deja en blanco.
- Cambiar el tamaño no recorta. Una etiqueta impresa en un cuarto de una página Carta o A4 sigue ocupando solo un cuarto de la página nueva.
- Los tamaños personalizados deben medir entre 0,5 y 200 in (12,7 a 5080 mm) por cada lado.
- La página se redimensiona a partir de su cuadro de recorte cuando lo tiene, así que una página recortada conserva solo la región recortada.
