---
description: "依列數將 CSV 分割為較小的檔案。"
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 405b1598f6c3
---

# Split CSV {#split-csv}

依列數將大型 CSV 或 TSV 檔案分割為較小的檔案。回傳包含各部分的 ZIP 壓縮檔。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

接受包含 CSV 檔案及 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | No | `1000` | 每個輸出檔案的資料列數（1-1,000,000） |
| keepHeader | boolean | No | `true` | 在每個輸出檔案中重複標頭列 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Notes {#notes}

- 輸出一律為包含分割後 CSV 各部分的 ZIP 壓縮檔，並依序命名（例如 `part-1.csv`、`part-2.csv`）。
- 當 `keepHeader` 為 `true` 時，每個部分都會包含原始標頭列，因此每個檔案都能獨立使用。
- CSV 與 TSV 檔案皆可作為輸入。
- 列數僅指資料列；標頭列不計入。
