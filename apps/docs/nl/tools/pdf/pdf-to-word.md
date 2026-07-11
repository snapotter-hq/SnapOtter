---
description: "Converteer een PDF naar een Word-document (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 274535771718
---

# PDF to Word {#pdf-to-word}

Converteer een op tekst gebaseerde PDF naar een Word-document (DOCX). Het meest geschikt voor PDF's met selecteerbare tekst; gescande pagina's hebben eerst OCR nodig.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Accepteert multipart-formuliergegevens met een PDF-bestand.

## Parameters {#parameters}

Dit hulpmiddel heeft geen configureerbare parameters. Upload een PDF en deze wordt geconverteerd naar DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

Geeft `202 Accepted` terug. Volg de voortgang via SSE op `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Geaccepteerd invoerformaat: `.pdf`.
- Werkt het best met op tekst gebaseerde PDF's. Gescande of alleen-afbeeldingspagina's produceren lege of minimale uitvoer; gebruik [PDF OCR](./ocr-pdf) om eerst een tekstlaag toe te voegen.
- De conversie wordt uitgevoerd door LibreOffice dat headless op de server draait.
- Complexe indelingen (meerdere kolommen, overlappende elementen) worden mogelijk niet perfect geconverteerd.
