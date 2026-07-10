---
description: "Convierte un EPUB a PDF, DOCX, HTML o Markdown."
i18n_source_hash: 7d94fc18ca97
i18n_provenance: human
i18n_output_hash: ced779c65b36
---

# Convertir EPUB {#convert-epub}

Convierte un libro electrónico EPUB a PDF, Word (DOCX), HTML o Markdown. Los recursos remotos dentro del libro no se descargan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Acepta datos de formulario multipart con un archivo EPUB y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| format | string | Sí | - | Formato de salida: `pdf`, `docx`, `html`, `md` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
```

## Ejemplo de respuesta {#example-response}

Devuelve `202 Accepted`. Sigue el progreso mediante SSE en `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notas {#notes}

- Formato de entrada aceptado: `.epub`.
- Los recursos remotos incrustados en el EPUB (imágenes y fuentes externas) no se descargan por seguridad.
- La fidelidad de las imágenes en la salida convertida puede variar según la estructura del EPUB.
- La conversión la gestiona Pandoc en el servidor.
