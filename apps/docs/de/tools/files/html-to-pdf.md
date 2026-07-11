---
description: "Konvertiert eine HTML-Datei in PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 3c147738d773
---

# HTML to PDF {#html-to-pdf}

Konvertiert eine HTML-Datei in ein gestaltetes PDF-Dokument. Entfernte Ressourcen (externe Bilder, Stylesheets, Skripte) sind aus Datenschutzgründen deaktiviert.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Akzeptiert Multipart-Formulardaten mit einer HTML-Datei.

## Parameters {#parameters}

Dieses Tool hat keine konfigurierbaren Parameter. Lade eine HTML-Datei hoch, und sie wird in PDF konvertiert.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- Akzeptierte Eingabeformate: `.html`, `.htm`.
- Entfernte Ressourcen (Bilder, Stylesheets, über URLs referenzierte Skripte) werden aus Datenschutz- und Sicherheitsgründen nicht abgerufen.
- Inline-Stile und eingebettete Bilder (Data-URIs) bleiben erhalten.
- Die Konvertierung wird von WeasyPrint auf dem Server durchgeführt.
