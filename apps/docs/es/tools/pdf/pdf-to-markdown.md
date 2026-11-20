---
description: "Convierte un PDF a Markdown y conserva los encabezados, las listas y las tablas que tenga el PDF."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 0457a94ca701
i18n_hash_version: 2
---

# PDF a Markdown {#pdf-to-markdown}

Convierte un PDF en un archivo Markdown que puedes llevar a una wiki, un sitio estático o un flujo con LLM.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Acepta datos de formulario multipart con un archivo PDF.

## Parameters {#parameters}

Esta herramienta no tiene parámetros configurables. Sube un PDF y recibirás un archivo `.md`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

Un PDF grande puede tardar más que la ventana síncrona. Entonces la API responde `202` con `jobId`, y sigues el progreso en `/api/v1/jobs/{jobId}/progress`.

## What gets kept {#what-gets-kept}

Un PDF guarda texto posicionado, no estructura, así que el conversor la deduce:

- **Encabezados.** Las líneas cortas con un tamaño claramente mayor que el del cuerpo pasan a ser encabezados de `#` a `######`, ordenados por tamaño en todo el documento.
- **Listas.** Las líneas que empiezan con una viñeta o un número pasan a ser elementos de lista.
- **Negrita, cursiva y enlaces.** Se conservan en línea. Solo sobreviven los enlaces `http`, `https` y `mailto`.
- **Tablas.** Las tablas dibujadas con líneas salen como tablas de Markdown. Las tablas maquetadas solo con espacios suelen salir como párrafos normales.

Las imágenes se descartan. Los diseños de varias columnas y las páginas poco habituales se tratan lo mejor posible, así que revisa la salida antes de fiarte de ella.

## Notes {#notes}

- Formato de entrada aceptado: `.pdf`.
- El campo `chars` de la respuesta es la longitud de la salida en Markdown.
- Un PDF escaneado no tiene capa de texto que convertir. La herramienta lo rechaza con `422` y el código `NO_TEXT_LAYER` en lugar de devolver un archivo vacío. Usa la herramienta [OCR de PDF](./ocr-pdf) en esos casos.
- Para el viaje de ida y vuelta, [Markdown a PDF](../files/markdown-to-pdf), [Markdown a DOCX](../files/markdown-to-docx) y [Markdown a HTML](../files/markdown-to-html) leen archivos `.md`.
