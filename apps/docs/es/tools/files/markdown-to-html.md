---
description: "Convierte un archivo Markdown en una página HTML independiente."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: a54ac814a64e
---

# Markdown a HTML {#markdown-to-html}

Convierte un archivo Markdown en una página HTML independiente. Las imágenes remotas referenciadas en el origen se dejan tal cual en la salida.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Acepta datos de formulario multipart con un archivo Markdown.

## Parámetros {#parameters}

Esta herramienta no tiene parámetros configurables. Sube un archivo Markdown y se convertirá a HTML.

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notas {#notes}

- Formatos de entrada aceptados: `.md`, `.markdown`.
- Esta es una herramienta rápida (síncrona) que devuelve el resultado directamente.
- La salida es una página HTML autónoma con estilos en línea.
- Las URL de imágenes remotas en el origen Markdown se conservan tal cual y no se descargan.
