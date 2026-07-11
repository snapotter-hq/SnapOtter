---
description: "Konvertiert eine Markdown-Datei in ein Word-Dokument (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: a45b2bda275c
---

# Markdown to Word {#markdown-to-word}

Konvertiert eine Markdown-Datei in ein Word-Dokument (DOCX) und behält dabei Überschriften, Listen, Codeblöcke und andere Formatierungen bei.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Akzeptiert Multipart-Formulardaten mit einer Markdown-Datei.

## Parameters {#parameters}

Dieses Tool hat keine konfigurierbaren Parameter. Lade eine Markdown-Datei hoch, und sie wird in DOCX konvertiert.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- Akzeptierte Eingabeformate: `.md`, `.markdown`.
- Dies ist ein schnelles (synchrones) Tool, das das Ergebnis direkt zurückgibt.
- Überschriften, Fett, Kursiv, Links, Codeblöcke und Listen werden auf Word-Formatvorlagen abgebildet.
- Die Konvertierung wird von Pandoc auf dem Server durchgeführt.
