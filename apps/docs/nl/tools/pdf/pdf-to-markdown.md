---
description: "Zet een PDF om naar Markdown, met behoud van koppen, lijsten en tabellen waar de PDF die heeft."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 877ef57bf35a
i18n_hash_version: 2
---

# PDF naar Markdown {#pdf-to-markdown}

Zet een PDF om in een Markdown-bestand dat je in een wiki, een statische site of een LLM-pipeline kunt gebruiken.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Accepteert multipart-formuliergegevens met een PDF-bestand.

## Parameters {#parameters}

Deze tool heeft geen configureerbare parameters. Upload een PDF en je krijgt een `.md`-bestand terug.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

Een grote PDF kan langer duren dan het synchrone venster. De API antwoordt dan met `202` en een `jobId`, en je volgt de voortgang op `/api/v1/jobs/{jobId}/progress`.

## Wat behouden blijft {#what-gets-kept}

Een PDF bevat gepositioneerde tekst, geen structuur, dus de converter leidt die af:

- **Koppen.** Korte regels die duidelijk groter zijn gezet dan de lopende tekst worden koppen van `#` tot `######`, gerangschikt op grootte over het hele document.
- **Lijsten.** Regels die beginnen met een opsommingsteken of een getal worden lijstitems.
- **Vet, cursief en links.** Blijven inline behouden. Alleen `http`-, `https`- en `mailto`-links blijven behouden.
- **Tabellen.** Tabellen die met lijnen zijn getekend komen eruit als Markdown-tabellen. Tabellen die alleen met spaties zijn opgemaakt komen meestal als gewone alinea's door.

Afbeeldingen worden weggelaten. Layouts met meerdere kolommen en ongebruikelijke paginaontwerpen worden naar beste kunnen verwerkt, controleer de uitvoer dus voordat je erop vertrouwt.

## Notes {#notes}

- Geaccepteerd invoerformaat: `.pdf`.
- Het veld `chars` in het antwoord is de lengte van de Markdown-uitvoer.
- Een gescande PDF heeft geen tekstlaag om te converteren. De tool weigert die met `422` en de code `NO_TEXT_LAYER` in plaats van een leeg bestand terug te geven. Gebruik daarvoor de tool [PDF OCR](./ocr-pdf).
- Voor de omgekeerde weg lezen [Markdown naar PDF](../files/markdown-to-pdf), [Markdown to DOCX](../files/markdown-to-docx) en [Markdown to HTML](../files/markdown-to-html) `.md`-bestanden.
