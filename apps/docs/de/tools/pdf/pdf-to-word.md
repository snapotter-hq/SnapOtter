---
description: "Eine PDF in ein Word-Dokument (DOCX) umwandeln."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 6f471b081fe5
---

# PDF zu Word {#pdf-to-word}

Wandeln Sie eine textbasierte PDF in ein Word-Dokument (DOCX) um. Am besten geeignet für PDFs mit auswählbarem Text; gescannte Seiten benötigen zuerst OCR.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei.

## Parameters {#parameters}

Dieses Tool hat keine konfigurierbaren Parameter. Laden Sie eine PDF hoch, und sie wird in DOCX umgewandelt.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

Gibt `202 Accepted` zurück. Verfolgen Sie den Fortschritt über SSE unter `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akzeptiertes Eingabeformat: `.pdf`.
- Funktioniert am besten mit textbasierten PDFs. Gescannte oder reine Bildseiten erzeugen eine leere oder minimale Ausgabe; verwenden Sie [PDF OCR](./ocr-pdf), um zuerst eine Textebene hinzuzufügen.
- Die Umwandlung wird von LibreOffice übernommen, das serverseitig ohne grafische Oberfläche ausgeführt wird.
- Komplexe Layouts (mehrspaltig, überlappende Elemente) werden möglicherweise nicht perfekt umgewandelt.
