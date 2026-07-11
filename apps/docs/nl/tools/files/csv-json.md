---
description: "Converteer tussen CSV en JSON, in beide richtingen."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: 434252d49741
---

# CSV to JSON {#csv-to-json}

Converteer tussen CSV- en JSON-formaten in beide richtingen. Upload een CSV- of TSV-bestand om een JSON-array van objecten te krijgen, of upload een JSON-array om een CSV-bestand te krijgen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Accepteert multipart-formulierdata met een CSV-, TSV- of JSON-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Nee | `true` | JSON-uitvoer opmaken met inspringing |

## Example Request {#example-request}

CSV naar JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON naar CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notes {#notes}

- De conversierichting wordt automatisch bepaald op basis van de bestandsextensie van de invoer: `.csv` of `.tsv` levert `.json`, en `.json` levert `.csv`.
- De parameter `pretty` heeft alleen invloed op de JSON-uitvoer. Wanneer ingesteld op `false`, is de uitvoer een compacte JSON-string op één regel.
- JSON-invoer moet een array van objecten zijn met consistente sleutels. Elk object wordt een rij, en elke sleutel wordt een kolomkop.
- TSV-bestanden (tab-gescheiden waarden) worden naast CSV ondersteund.
