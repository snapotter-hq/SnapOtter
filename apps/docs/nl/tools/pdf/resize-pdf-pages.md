---
description: "Pas het formaat van elke pagina van een PDF aan naar A4, Letter, een verzendlabel van 4x6 inch of een aangepast formaat."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 3aafcf830939
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

Wijzig het paginaformaat van elke pagina in een PDF. De inhoud wordt geschaald zodat die op de nieuwe pagina past en wordt gecentreerd, zodat tekst, vectorafbeeldingen en barcodes scherp blijven. Gebruik dit om een verzendlabel om te zetten naar een pagina van 4x6 inch voor een thermische printer, of om een document tussen A4 en US Letter te verplaatsen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Accepteert multipart form data met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| pageSize | string | Nee | `"4x6in"` | Doelformaat: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal` of `custom` |
| width | number | Nee | `4` | Aangepaste paginabreedte, gebruikt wanneer `pageSize` `custom` is |
| height | number | Nee | `6` | Aangepaste paginahoogte, gebruikt wanneer `pageSize` `custom` is |
| unit | string | Nee | `"in"` | Eenheid voor het aangepaste formaat: `in` of `mm` |
| keepOrientation | boolean | Nee | `false` | Draai het doelformaat zodat het de oriëntatie van elke pagina volgt in plaats van breedte bij hoogte af te dwingen |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- Pagina's worden geschaald zodat ze passen en nooit uitgerekt. Als de beeldverhouding verschilt, blijft de overgebleven ruimte leeg.
- Het formaat wijzigen snijdt niet bij. Een label dat op een kwart van een Letter- of A4-pagina is afgedrukt, vult nog steeds maar een kwart van de nieuwe pagina.
- Aangepaste formaten moeten aan elke zijde 0,5-200 inch (12,7-5080 mm) zijn.
- Het formaat van de pagina wordt aangepast vanaf de uitsnijdbox als die er is, dus een bijgesneden pagina behoudt alleen het bijgesneden gebied.
