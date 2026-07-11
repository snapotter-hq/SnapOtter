---
description: "Formulare und Anmerkungen in den Seiteninhalt einbrennen."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: bfba997fdf8a
---

# PDF reduzieren {#flatten-pdf}

Brennen Sie interaktive Formularfelder und Anmerkungen in den Seiteninhalt ein und erzeugen Sie eine statische PDF, die überall gleich aussieht.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei.

## Parameters {#parameters}

Dieses Tool hat keine konfigurierbaren Parameter. Laden Sie eine PDF hoch, und alle Formulare und Anmerkungen werden reduziert.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- Akzeptiertes Eingabeformat: `.pdf`.
- Dies ist ein schnelles (synchrones) Tool, das das Ergebnis direkt zurückgibt.
- Formularfeldwerte werden als statischer Text in der Ausgabe beibehalten.
- Anmerkungen (Kommentare, Hervorhebungen, Haftnotizen) werden Teil des Seiteninhalts und können nicht mehr bearbeitet werden.
