---
description: "Splits een CSV op in kleinere bestanden op basis van het aantal rijen."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: f5bf4d4e36da
---

# CSV splitsen {#split-csv}

Splits een groot CSV- of TSV-bestand op in kleinere bestanden op basis van het aantal rijen. Retourneert een ZIP-archief met de onderdelen.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Accepteert multipart form data met een CSV-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | Nee | `1000` | Aantal datarijen per uitvoerbestand (1-1.000.000) |
| keepHeader | boolean | Nee | `true` | Herhaal de koprij in elk uitvoerbestand |

## Voorbeeldaanvraag {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Opmerkingen {#notes}

- De uitvoer is altijd een ZIP-archief met de gesplitste CSV-onderdelen, opeenvolgend benoemd (bijv. `part-1.csv`, `part-2.csv`).
- Wanneer `keepHeader` `true` is, bevat elk onderdeel de originele koprij, zodat elk bestand zelfstandig kan worden gebruikt.
- Zowel CSV- als TSV-bestanden worden als invoer geaccepteerd.
- Het rijaantal verwijst alleen naar datarijen; de koprij wordt niet meegeteld.
