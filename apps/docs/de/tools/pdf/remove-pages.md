---
description: "Bestimmte Seiten aus einer PDF löschen."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: a3b5162e1c18
---

# Seiten entfernen {#remove-pages}

Löschen Sie bestimmte Seiten aus einer PDF, wobei alle verbleibenden Seiten intakt bleiben.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| pages | string | Ja | - | Zu entfernender Seitenbereich in qpdf-Syntax, z. B. `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Sie können nicht jede Seite aus einem Dokument entfernen; mindestens eine Seite muss erhalten bleiben.
- Seitenbereiche verwenden die qpdf-Syntax: `3` für eine einzelne Seite, `5-7` für einen Bereich und Kommas zum Kombinieren (z. B. `1,3,5-7`).
