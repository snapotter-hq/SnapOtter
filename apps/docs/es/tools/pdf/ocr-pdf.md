---
description: "Extrae texto de documentos PDF mediante OCR con inteligencia artificial."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: bddf4136c82a
---

# OCR de PDF {#pdf-ocr}

Extrae texto de documentos PDF mediante reconocimiento óptico de caracteres con inteligencia artificial. Admite varios niveles de calidad e idiomas. Requiere que el paquete de funciones OCR esté instalado.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings` opcional.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Nivel de calidad del OCR: `fast`, `balanced`, `best` |
| language | string | No | `"auto"` | Idioma del documento: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | Selección de páginas, p. ej. `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

Devuelve `202 Accepted`. Sigue el progreso mediante SSE en `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Formato de entrada aceptado: `.pdf`.
- Esta es una herramienta de IA que requiere que el **paquete de funciones OCR** esté instalado. Si el paquete no está instalado, la API devuelve `501 Not Implemented`.
- El nivel de calidad `fast` usa un modelo más ligero para un procesamiento más rápido; `best` usa un modelo más preciso a costa de la velocidad.
- El ajuste de idioma `auto` intenta detectar el idioma del documento automáticamente.
- Puedes seleccionar páginas concretas mediante rangos (`"1-3"`), listas separadas por comas (`"1,3,5"`) o `"all"` para todas las páginas.
- Para los PDF que ya contienen texto seleccionable, considera usar la herramienta más rápida [PDF a texto](./pdf-to-text) en su lugar.
