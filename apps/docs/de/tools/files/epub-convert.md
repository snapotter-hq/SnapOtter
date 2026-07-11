---
description: "Konvertiert ein EPUB in PDF, DOCX, HTML oder Markdown."
i18n_source_hash: 7d94fc18ca97
i18n_provenance: human
i18n_output_hash: 2af5c980e761
---

# Convert EPUB {#convert-epub}

Konvertiert ein EPUB-E-Book in PDF, Word (DOCX), HTML oder Markdown. Entfernte Ressourcen im Buch werden nicht abgerufen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Akzeptiert Multipart-Formulardaten mit einer EPUB-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| format | string | Ja | - | Ausgabeformat: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
```

## Example Response {#example-response}

Gibt `202 Accepted` zurück. Verfolge den Fortschritt per SSE unter `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akzeptiertes Eingabeformat: `.epub`.
- Entfernte, im EPUB eingebettete Ressourcen (externe Bilder, Schriftarten) werden aus Sicherheitsgründen nicht abgerufen.
- Die Bildtreue in der konvertierten Ausgabe kann je nach EPUB-Struktur variieren.
- Die Konvertierung wird von Pandoc auf dem Server durchgeführt.
