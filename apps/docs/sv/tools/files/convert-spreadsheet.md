---
description: "Konvertera mellan formaten Excel, OpenDocument och CSV."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 1c9f6f9769be
---

# Convert Spreadsheet {#convert-spreadsheet}

Konvertera kalkylblad mellan formaten Excel (XLSX), OpenDocument Spreadsheet (ODS) och CSV. Arbetsböcker med flera blad exporterar det första bladet vid konvertering till CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Tar emot multipart-formulärdata med en Excel/ODS/CSV-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Utdataformat: `xlsx`, `ods`, `csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Example Response {#example-response}

Returnerar `202 Accepted`. Följ förloppet via SSE på `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Godkända indataformat: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Vid konvertering av en arbetsbok med flera blad till CSV exporteras endast det första bladet.
- Formler beräknas och exporteras som statiska värden i CSV-utdata.
- Utdataformatet måste skilja sig från indataformatet.
