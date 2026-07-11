---
description: "Voeg paginanummers toe aan elke pagina van een PDF."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 94b3a252b194
---

# PDF Page Numbers {#pdf-page-numbers}

Voeg "Pagina N van M"-paginanummers toe aan elke pagina van een PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| position | string | Nee | `"bc"` | Plaatsing van het paginanummer: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | Nee | `10` | Lettergrootte in punten (6-24) |

### Position Values {#position-values}

- `tl` linksboven, `tc` middenboven, `tr` rechtsboven
- `bl` linksonder, `bc` middenonder, `br` rechtsonder

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- Paginanummers worden weergegeven in de indeling "Pagina 1 van 10".
- Nummers worden aan elke pagina toegevoegd, inclusief eventuele bestaande titel- of omslagpagina's.
- De standaardpositie `"bc"` plaatst nummers middenonder op elke pagina.
