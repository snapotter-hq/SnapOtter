---
description: "Convierte entre formatos Word, OpenDocument, RTF y texto plano."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 7346a3e9898b
---

# Convertir documento {#convert-document}

Convierte documentos entre los formatos Word (DOCX), OpenDocument (ODT), RTF y texto plano usando LibreOffice.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Acepta datos de formulario multipart con un archivo Word/ODT/RTF/TXT y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| format | string | Sí | - | Formato de salida: `docx`, `odt`, `rtf`, `txt` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- Formatos de entrada aceptados: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- La conversión la gestiona LibreOffice ejecutándose sin interfaz gráfica en el servidor.
- El formato complejo (macros, objetos incrustados) puede no conservarse en la conversión entre formatos.
- El formato de salida debe ser distinto del formato de entrada.
