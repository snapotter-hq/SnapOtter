---
description: "Reordena, rota, elimina y extrae páginas de otros PDFs en un editor o mediante la API."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: fa740ae7a85d
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

Ensambla un PDF a partir de un plan de páginas explícito: reordena, duplica, rota o elimina páginas, y extrae páginas de PDFs adicionales, todo en una sola solicitud.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Acepta datos de formulario multipart con uno o más archivos PDF y un campo JSON `settings`.
Se admiten hasta 20 documentos de entrada y 1.200 páginas de salida por solicitud.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| items | array | Sí | Plan de páginas de salida, en orden de salida. Cada elemento es `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` indexa los archivos subidos en orden de subida (base 0); `page` es un número de página base 1 en ese documento. |
| pageCounts | array | Sí | Número real de páginas de cada documento subido, en el mismo orden. Una página del plan que supere el número de páginas de su documento se rechaza con 400. |

## Example Request {#example-request}

Toma las páginas 3 y 1 del primer documento y las páginas 1 y 2 del segundo, rotando la primera página de salida 90° en sentido horario:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- La misma página puede aparecer varias veces en `items` para duplicarla.
- Las páginas ausentes de `items` se omiten de la salida.
- `rot` registra la nueva orientación de visualización en la página copiada (compuesta con cualquier rotación existente); el contenido de la página no se modifica.
- La rotación se aplica por cada copia de salida, por lo que los duplicados pueden tener rotaciones distintas.
- La salida es un documento nuevo y plano; no se conservan los marcadores ni los metadatos a nivel de documento de origen.
- El procesamiento requiere el binario qpdf, que se incluye en la imagen Docker oficial.
