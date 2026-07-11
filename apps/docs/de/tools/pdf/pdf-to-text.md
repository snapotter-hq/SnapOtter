---
description: "Reinen Text aus einer PDF extrahieren."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: 9610e022db2c
---

# PDF zu Text {#pdf-to-text}

Extrahieren Sie den gesamten lesbaren reinen Text aus einem PDF-Dokument in eine Textdatei.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei.

## Parameters {#parameters}

Dieses Tool hat keine konfigurierbaren Parameter. Laden Sie eine PDF hoch, und ihr Textinhalt wird extrahiert.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- Akzeptiertes Eingabeformat: `.pdf`.
- Dies ist ein schnelles (synchrones) Tool, das das Ergebnis direkt zurückgibt.
- Das Feld `chars` in der Antwort gibt die Anzahl der extrahierten Zeichen an.
- Es wird nur digital eingebetteter Text extrahiert. Verwenden Sie für gescannte Dokumente oder bildbasierte PDFs stattdessen das Tool [PDF OCR](./ocr-pdf).
