---
description: "在 CSV 與 JSON 之間雙向轉換。"
i18n_source_hash: 5b24abf5e9d2
i18n_provenance: human
i18n_output_hash: 50a262af872e
---

# CSV 轉 JSON {#csv-to-json}

在 CSV 與 JSON 格式之間雙向轉換。上傳 CSV 或 TSV 檔案以取得一個物件的 JSON 陣列，或上傳 JSON（物件陣列，或包著一個物件陣列的物件）以取得 CSV 檔案。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

接受包含一個 CSV、TSV 或 JSON 檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | 以縮排美化輸出 JSON |

## Example Request {#example-request}

CSV 轉 JSON：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON 轉 CSV：

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

- 轉換方向會依輸入檔案的副檔名自動偵測：`.csv` 或 `.tsv` 會產生 `.json`，而 `.json` 會產生 `.csv`。
- `pretty` 參數只會影響 JSON 輸出。設為 `false` 時，輸出為緊湊的單行 JSON 字串。
- JSON 輸入可以是物件陣列、只含一個鍵且其值為這類陣列的物件（如 `{"data": [...]}`），或僅含純量值的扁平物件。每個物件會成為一列，每個鍵會成為一個欄位標題。扁平物件會產生 `key,value` 兩欄的表格。含多個頂層鍵的物件與空陣列會被拒絕。
- 除了 CSV 之外，也支援 TSV（以定位字元分隔的值）檔案。
