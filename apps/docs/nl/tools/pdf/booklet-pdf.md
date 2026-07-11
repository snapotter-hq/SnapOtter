---
description: "PDF-pagina's ordenen om te vouwen tot een boekje."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 961e8f8f4017
---

# Boekje-PDF {#booklet-pdf}

Schik pagina's in voor dubbelzijdig printen zodat de gedrukte vellen tot een boekje kunnen worden gevouwen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Accepteert multipart form data met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Nee | `2` | Pagina's per vel: `2`, `4`, `6` of `8` |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Opmerkingen {#notes}

- De standaard `perSheet: 2` plaatst twee pagina's naast elkaar op elk vel, wat de standaard boekjeslay-out is voor dubbelzijdig printen.
- Blanco pagina's worden automatisch toegevoegd als het totale aantal pagina's geen veelvoud is van de velgrootte.
- Print de uitvoer dubbelzijdig met binding aan de korte zijde, vouw daarna en niet.
