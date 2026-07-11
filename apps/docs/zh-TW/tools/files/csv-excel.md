---
description: "在 CSV 與 Excel（XLSX）之間雙向轉換。"
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 8104b315b8cc
---

# CSV 轉 Excel {#csv-to-excel}

在 CSV 與 Excel（XLSX）格式之間雙向轉換。上傳 CSV 或 TSV 檔案以取得 XLSX，或上傳 XLSX 檔案以取得 CSV。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

接受包含一個 CSV、TSV 或 XLSX 檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | 從 XLSX 轉換時要匯出的工作表編號（最小值 1） |

## Example Request {#example-request}

CSV 轉 Excel：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel 轉 CSV：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notes {#notes}

- 轉換方向會依輸入檔案的副檔名自動偵測：`.csv` 或 `.tsv` 會產生 `.xlsx`，而 `.xlsx` 會產生 `.csv`。
- `sheet` 參數只在從 XLSX 轉換時適用。它會選擇要匯出哪個工作表。
- 除了 CSV 之外，也支援 TSV（以定位字元分隔的值）檔案。
