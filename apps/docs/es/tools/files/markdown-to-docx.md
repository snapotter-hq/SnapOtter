---
description: "Convierte un archivo Markdown en un documento de Word (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: d5d9e8c43f7a
---

# Markdown a Word {#markdown-to-word}

Convierte un archivo Markdown en un documento de Word (DOCX), conservando encabezados, listas, bloques de código y otros formatos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Acepta datos de formulario multipart con un archivo Markdown.

## Parámetros {#parameters}

Esta herramienta no tiene parámetros configurables. Sube un archivo Markdown y se convertirá a DOCX.

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notas {#notes}

- Formatos de entrada aceptados: `.md`, `.markdown`.
- Esta es una herramienta rápida (síncrona) que devuelve el resultado directamente.
- Los encabezados, la negrita, la cursiva, los enlaces, los bloques de código y las listas se asignan a estilos de Word.
- La conversión la gestiona Pandoc en el servidor.
