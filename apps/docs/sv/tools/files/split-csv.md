---
description: "Dela upp en CSV i mindre filer efter antal rader."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: ceb34941674a
---

# Dela upp CSV {#split-csv}

Dela upp en stor CSV- eller TSV-fil i mindre filer efter antal rader. Returnerar ett ZIP-arkiv som innehåller delarna.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Tar emot multipart-formulärdata med en CSV-fil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| rowsPerFile | heltal | Nej | `1000` | Antal datarader per utdatafil (1-1 000 000) |
| keepHeader | boolean | Nej | `true` | Upprepa rubrikraden i varje utdatafil |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Anteckningar {#notes}

- Utdata är alltid ett ZIP-arkiv som innehåller de uppdelade CSV-delarna, namngivna i följd (t.ex. `part-1.csv`, `part-2.csv`).
- När `keepHeader` är `true` inkluderar varje del den ursprungliga rubrikraden så att varje fil kan användas fristående.
- Både CSV- och TSV-filer godtas som indata.
- Radantalet avser endast datarader; rubrikraden räknas inte.
