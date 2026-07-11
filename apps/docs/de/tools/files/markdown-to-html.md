---
description: "Konvertiert eine Markdown-Datei in eine eigenständige HTML-Seite."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: 48665f70348f
---

# Markdown to HTML {#markdown-to-html}

Konvertiert eine Markdown-Datei in eine eigenständige HTML-Seite. Im Quelltext referenzierte entfernte Bilder werden in der Ausgabe unverändert belassen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Akzeptiert Multipart-Formulardaten mit einer Markdown-Datei.

## Parameters {#parameters}

Dieses Tool hat keine konfigurierbaren Parameter. Lade eine Markdown-Datei hoch, und sie wird in HTML konvertiert.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- Akzeptierte Eingabeformate: `.md`, `.markdown`.
- Dies ist ein schnelles (synchrones) Tool, das das Ergebnis direkt zurückgibt.
- Die Ausgabe ist eine in sich geschlossene HTML-Seite mit Inline-Stilen.
- Entfernte Bild-URLs im Markdown-Quelltext bleiben unverändert erhalten und werden nicht abgerufen.
