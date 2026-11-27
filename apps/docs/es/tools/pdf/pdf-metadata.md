---
description: "Lee y escribe los metadatos de un documento PDF."
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: eae7b8af9ac5
i18n_hash_version: 2
---

# Metadatos de PDF {#pdf-metadata}

Lee y actualiza los campos de metadatos de un documento PDF, como el título, el autor, el asunto y las palabras clave, o elimina por completo los metadatos del documento. Cuando no se proporciona ninguna configuración, se devuelven los metadatos existentes sin modificarlos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings` opcional.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Título del documento (máximo 500 caracteres) |
| author | string | No | - | Autor del documento (máximo 500 caracteres) |
| subject | string | No | - | Asunto del documento (máximo 500 caracteres) |
| keywords | string | No | - | Palabras clave del documento (máximo 500 caracteres) |
| stripAll | boolean | No | false | Elimina todo el diccionario Info (fechas, Creator, Producer, claves personalizadas), todos los flujos XMP (documento, páginas, imágenes) y todos los datos de aplicación PieceInfo, y luego escribe los campos indicados arriba |
| removeAttachments | boolean | No | false | Elimina también los archivos incrustados: la lista de adjuntos del documento, las anotaciones de archivo adjunto y los archivos asociados (`/AF`). Requiere `stripAll` |

Todos los parámetros son opcionales. Los campos omitidos se dejan sin cambios, salvo que se establezca `stripAll`.

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notas {#notes}

- Formato de entrada aceptado: `.pdf`.
- Esta es una herramienta rápida (síncrona) que devuelve el resultado directamente.
- El campo `metadata` de la respuesta contiene los metadatos resultantes tras cualquier actualización.
- Para leer los metadatos sin modificarlos, omite el campo `settings` o envía un objeto vacío.
- Cada campo de metadatos está limitado a 500 caracteres.
- Con `stripAll`, la respuesta también incluye `stripped`: las claves de Info que se eliminaron (`removed`), si se eliminó el flujo XMP del documento (`xmpRemoved`), el nivel PDF/A que declaraba la entrada (`pdfa`, o `null`), cuántos flujos XMP se quitaron de páginas, imágenes y otros objetos (`objectXmpRemoved`), cuántos diccionarios PieceInfo se eliminaron (`pieceInfoRemoved`) y cuántos archivos incrustados se eliminaron (`attachmentsRemoved`, siempre `0` sin `removeAttachments`). Eliminar XMP rompe la conformidad con PDF/A.
- `stripAll` por sí solo conserva los archivos adjuntos incrustados, ya que eliminarlos cambia el contenido del documento. Añade `removeAttachments` para eliminarlos también. Esto quita el XML adjunto de las facturas electrónicas ZUGFeRD y Factur-X y rompe la conformidad con PDF/A-3.
- Enviar `removeAttachments` sin `stripAll` devuelve 400.
