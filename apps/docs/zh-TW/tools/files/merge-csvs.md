---
description: "將多個欄位相符的 CSV 或 TSV 檔案合併為一個。"
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: f5e59e94d33e
---

# Merge CSVs {#merge-csvs}

將多個欄位相符的 CSV 或 TSV 檔案合併為單一檔案。所有輸入檔案必須具有相同的欄位標頭。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

接受包含兩個以上 CSV 檔案的 multipart form data。不需要 settings 欄位。

## Parameters {#parameters}

此工具沒有可設定的參數。上傳 2 至 20 個欄位標頭相符的 CSV 或 TSV 檔案。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Notes {#notes}

- 需要 2 至 20 個輸入檔案。
- 所有檔案必須共用相同的欄位標頭。若欄位不符，合併將會失敗。
- 標頭列在輸出中僅包含一次；所有檔案的資料列會依上傳順序串接。
- CSV 與 TSV 檔案皆可接受，但單一請求中的所有檔案應使用相同的分隔符號。
